const { ux, sdk } = require('@cto.ai/sdk')
const path = require('path');
const {
  awsRegion,
  kernelPrompt,
  forcePrompt,
} = require('../../prompts');
const {
  writeToFileSync,
  getImageName,
  track,
} = require('../helpers');

const AWS_DIR = path.resolve(sdk.homeDir() || '', '.aws')

/**
 * Create retrieves info from the user specific to AWS, authenticates the
 * aws cli, and then creates our JupyterLab deployment.
 *
 * @param {object} creds Optional object containing credentials for AWS
 */
async function Create(creds) {
  // Retrieve needed information from the user
  const { region } = await ux.prompt(awsRegion)
  const { JUPYTER_PASSWORD } = await sdk.getSecret('JUPYTER_PASSWORD')
  const { kernel } = await ux.prompt(kernelPrompt)
  const image = getImageName(kernel)

  let { keyId, key } = creds
  let password = JUPYTER_PASSWORD

  // Configure our authentication credentials
  try {
    await authenticateAWS(keyId, key, region, true)
  } catch (err) {
    sdk.log(ux.colors.red("Error creating ecsTaskExecutionRole:"))
    await track({
      event: 'AWS ecsTaskExecutionRole creation',
      error: `${err}`
    })
    throw err
  }

  try {
    const { subnets, groupId } = await configureCluster(keyId, key, region)

    await configureInstance(subnets, groupId, password, image)
    await bootInstance(password)
  } catch (err) {
    await track({
      event: 'AWS Creation',
      error: `${err}`
    })
    throw err
  }

  await ux.spinner.start(ux.colors.cyan('Cleaning up Op resources'))
  await sdk.exec(`rm -r ${AWS_DIR}`)
  await ux.spinner.stop(ux.colors.green('Removed tmp files!'))

  await track({
    event: 'AWS Creation',
    success: true,
  })
}

/**
 * authenticateAWS creates the necessary credentials and config file for the
 * aws cli and optionally creates the ecsTaskExecutionRole.
 *
 * @param {string}  keyId      The user's AWS Key ID
 * @param {string}  key        The user's secret access key
 * @param {string}  region     The region to use and create the IAM role in
 * @param {boolean} createRole Control if we create the ecsTaskExecutionRole
 */
async function authenticateAWS(keyId, key, region, createRole) {
  if (!createRole) return
  // ecs-cli only works with AWS creds written to file...
  const creds = `[default]\naws_access_key_id = ${keyId}\naws_secret_access_key = ${key}\n`
  writeToFileSync({
    dirPath: AWS_DIR,
    fileName: 'credentials',
    data: creds,
  })

  const config = `[default]\nregion = ${region}\n`
  writeToFileSync({
    dirPath: AWS_DIR,
    fileName: 'config',
    data: config,
  })

  //console.log(util.inspect(keyId, false, null, true))
  await ux.spinner.start(ux.colors.cyan("Creating ecsTaskExecutionRole IAM role..."))
  try {
    await sdk.exec(`aws iam --region ${region} create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://config/task-execution-assume-role.json`)
    await sdk.exec(`aws iam --region ${region} attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`)
  } catch (err) {
    if (err.message.includes('EntityAlreadyExists')) {
      await ux.spinner.stop(ux.colors.green("ecsTaskExecutionRole exists!"))
      return
    }
    await ux.spinner.stop(ux.colors.red("Failed to create ecsTaskExecutionRole!"))
    throw err
  }
  await ux.spinner.stop(ux.colors.green("ecsTaskExecutionRole exists!"))
}

/**
 * configureCluster configures a new FARGATE cluster.
 *
 * @param {string} keyId The AWS Key id for your account
 * @param {string} key The AWS Secret value for you account
 * @param {string} region The region to create the cluster in
 *
 * @return {object} An object containing the subnet ids and group id
 */
async function configureCluster(keyId, key, region) {
  const subnets = []
  let vpcId = ''
  let groupId = ''

  try {
    await ux.spinner.start(ux.colors.cyan('Configuring cluster'))
    await sdk.exec('ecs-cli configure --cluster jupyter --default-launch-type FARGATE --region ${region} --config-name jupyter-config')
  } catch (err) {
    await ux.spinner.stop(ux.colors.red('ERROR: Cluster config failed!'))
    throw err
  }
  await ux.spinner.stop(ux.colors.green('Cluster config done!'))

  try {
    // Ask user is recreating instance is wanted.
    // Note: ecs-cli fails to destroy cluster using this method, force is not currently supported.
    // Error: "Timeout waiting for stack operation to complete"
    // Bug Thread: https://github.com/aws/amazon-ecs-cli/issues/599
    let forceVal = ''
    // const { force } = await ux.prompt(forcePrompt)
    // if (force) { forceVal = '--force' }

    await ux.spinner.start(ux.colors.cyan('Spinning up cluster. This may take a few minutes'))
    const { stdout } = await sdk.exec(`ecs-cli up --instance-role jupyter-profile --cluster-config jupyter-config ${forceVal}`)

    // Find subnets and vpc from output.
    stdout.split("\n").map(line => {
      if (line.includes('subnet')) {
        subnets.push(line.substring(16, 40))
      }

      if (line.includes('vpc')) {
        vpcId = line.substring(13, 34)
      }
    })
  } catch (err) {
    await ux.spinner.stop(ux.colors.red('ERROR: Failed to spin up cluster!'))
    throw err
  }
  await ux.spinner.stop(ux.colors.green('Finished spinning up cluster!'))

  try {
    await ux.spinner.start(ux.colors.cyan('Retrieving security group ID'))
    const { stdout } = await sdk.exec(`aws ec2 describe-security-groups --filters Name=vpc-id,Values=${vpcId} --region ${region}`)
    const regex = /(sg-.*)\"/g;
    const match = regex.exec(stdout)
    if (match && match[1]) {
      groupId = match[1]
    }
  } catch (err) {
    await ux.spinner.stop(ux.colors.red('ERROR: Failed to retrieve security group ID!'))
    throw err
  }
  await ux.spinner.stop(ux.colors.green('Fetched security group ID!'))
  sdk.log(ux.colors.cyan('AWS ECS cluster configured successfully!\n'))

  await ux.spinner.start(ux.colors.cyan("Allowing inbound access on port 8888"))
  await sdk.exec(`aws ec2 authorize-security-group-ingress --group-id ${groupId} --protocol tcp --port 8888 --cidr 0.0.0.0/0 --region ${region}`)
  await ux.spinner.stop(ux.colors.green('Inbound access allowed on 8888!'))

  return { subnets, groupId }
}

/**
 * configureInstance creates docker-compose.yml and ecs-params.yml files for
 * our instance configuration.
 *
 * @param {array}  subnets An array containing the two subnet ids for our cluster
 * @param {string} groupId The cluster's group id
 * @param {token}  token   The token the user requested for their JupyterLab login
 * @param {string} image   The JupyterLab docker image to use
 */
async function configureInstance(subnets, groupId, token, image) {
  createCompose(image, token)
  createECS(subnets, groupId)
}

/**
 * createCompose creates a docker-compose.yml file.
 *
 * @param {string} image The JupyterLab docker image to use
 * @param {string} token The token to use for JupyterLab login
 */
function createCompose(image, token) {
  const compose = `version: "3"\nservices:\n jupyter:\n  image: ${image}\n  ports:\n   - "8888:8888"\n  environment:\n   - JUPYTER_TOKEN=${token}\n   - JUPYTER_ENABLE_LAB=yes`;
  sdk.log(ux.colors.cyan("\nUsing docker-compose.yml with contents:\n"))
  sdk.log(compose)
  writeToFileSync({
    dirPath: "/root/.config/@cto.ai/ops/platform-solutions/jupyter/config",
    fileName: 'docker-compose.yml',
    data: compose,
  })
}

/**
 * createECS creates an ecs-params.yml file.
 *
 * @param {array}  subnets An array containing the subnet ids for a cluster
 * @param {string} groupId The group id for a cluster
 */
function createECS(subnets, groupId) {
  const ecs = `version: 1\ntask_definition:\n task_execution_role: ecsTaskExecutionRole\n ecs_network_mode: awsvpc\n task_size:\n  mem_limit: 0.5GB\n  cpu_limit: 256\nrun_params:\n network_configuration:\n  awsvpc_configuration:\n   subnets:\n    - "${subnets[0]}"\n    - "${subnets[1]}"\n   security_groups:\n    - "${groupId}"\n   assign_public_ip: ENABLED`
  sdk.log(ux.colors.cyan("\nUsing ecs-params.yml with contents:\n"))
  sdk.log(ecs, "\n")
  writeToFileSync({
    dirPath: "/root/.config/@cto.ai/ops/platform-solutions/jupyter/config",
    fileName: 'ecs-params.yml',
    data: ecs,
  })
}

/**
 * bootInstance spins up our JupyterLab image on our cluster.
 *
 * @param {string} token The token the user requested for their JupyterLab login
 */
async function bootInstance(token) {
  let ip = '';

  // Copy docker-compose.yml and ecs-params.yml to our current working directory
  await sdk.exec('cp /root/.config/@cto.ai/ops/platform-solutions/jupyter/config/* .')

  try {
    // Create our instance
    await ux.spinner.start(ux.colors.cyan("Booting JupyterLab instance"))
    await sdk.exec(`ecs-cli compose --project-name jupyter --file docker-compose.yml service up --ecs-profile ecs-params.yml --cluster-config jupyter-config`)

    // Retrieve the IP of our instance from AWS
    const { stdout } = await sdk.exec('ecs-cli compose --project-name jupyter service ps --ecs-profile ecs-params.yml --cluster jupyter --cluster-config jupyter-config')
    const regex = /(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g;
    const match = regex.exec(stdout)
    if (match && match[1]) {
      ip = match[1];
    }
  } catch (err) {
    await ux.spinner.stop(ux.colors.red('ERROR: Failed to boot JupyterLab instance!'))
    throw err
  }
  await ux.spinner.stop(ux.colors.green('Done, JupyterLab instance is setup!'))

  sdk.log('Successfully deployed Jupyter Lab to AWS! You can access it', ux.url('here', `http://${ip}:8888/?token=${token}`))
}

/**
 * Destroy removes any running tasks and services within the jupyter project
 * before removing our cluster.
 *
 * @param {object} creds Optional object containing credentials for AWS
 */
async function Destroy(creds) {
  const { region } = await ux.prompt(awsRegion)
  let { keyId, key } = creds

  try {
    // Configure our authentication credentials
    await authenticateAWS(keyId, key, region, false)
    await ux.spinner.start(ux.colors.cyan("Tearing down AWS JupyterLab deployment"))

    // Copy docker-compose.yml and ecs-params.yml to our current working directory
    await sdk.exec('cp /root/.config/@cto.ai/ops/platform-solutions/jupyter/config/* .')

    // Remove any running tasks and services
    const { stdout } = await sdk.exec('ecs-cli compose --project-name jupyter service rm --cluster-config jupyter-config')
    stdout.split('\n').map(line => {
        if (line.includes('level=error') || line.includes('level=fatal')) {
          throw new Error(line)
        }
    })

    // Delete the cluster
    await sdk.exec('ecs-cli down -f --cluster-config jupyter-config')
  } catch (err) {
    await ux.spinner.stop(ux.colors.red('Error! Failed to teardown cluster'))
    await track({
      event: 'AWS Destroy',
      error: `${err}`
    })
    throw err
  }

  await track({
    event: 'AWS Destroy',
    success: true,
  })

  await ux.spinner.stop(ux.colors.green("Finished tearing down cluster and JupyterLab instance!"))

  // Final cleanup statement.
  await ux.spinner.start(ux.colors.cyan('Cleaning up Op resources'))
  await sdk.exec(`rm -r ${AWS_DIR}`)
  await ux.spinner.stop(ux.colors.green('Removed tmp files!'))
}

module.exports = {
  Create: Create,
  Destroy: Destroy,
};
