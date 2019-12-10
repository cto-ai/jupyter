const { ux, sdk } = require('@cto.ai/sdk')
const { spawn } = require('child_process')
const { childProc } = require('../helpers');
const path = require('path');
const {
  awsEssentialPrompts,
  awsPrompts,
  continuePrompts,
  updateConfigPrompt,
} = require('../../prompts');
const {
  writeToFileSync,
  getImageName,
  track,
  useOldCreds,
  storeCreds,
} = require('../helpers');

const AWS_DIR = path.resolve(process.env.HOME || '', '.aws')

/**
 * Create retrieves info from the user specific to AWS, authenticates the
 * aws cli, and then creates our JupyterLab deployment.
 *
 * @param {object} creds Optional object containing credentials for AWS
 */
async function Create(creds) {
  // Should we use the previously entered credentials for DigitalOcean?
  const useOld = await useOldCreds(creds, 'AWS')

  // Retrieve needed information from the user
  const {
    keyId,
    key,
    region,
    password,
    kernel,
  } = await ux.prompt(useOld ? awsPrompts.slice(2) : awsPrompts)
  const image = getImageName(kernel)

  if (!useOld) storeCreds({ keyId, key }, 'AWS')

  // Configure our authentication credentials
  try {
    if (useOld) {
      await authenticateAWS(creds.AWS.keyId, creds.AWS.key, region, true)
    } else {
      await authenticateAWS(keyId, key, region, true)
    }
  } catch (err) {
    sdk.log(ux.colors.red("Error creating ecsTaskExecutionRole:"))
    sdk.log(ux.colors.red(err))
    await track({
      event: 'AWS ecsTaskExecutionRole creation',
      error: `${err}`
    })
    return
  }

  try {
    const { subnets, groupId } = await configureCluster(region)

    await configureInstance(subnets, groupId, password, image)
    await bootInstance(password)
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'AWS Creation',
      error: `${err}`
    })
    return
  }

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

  if (!createRole) return

  sdk.log(ux.colors.blue("\nCreating ecsTaskExecutionRole IAM role..."))
  try {
    await sdk.exec(`aws iam --region ${region} create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://config/task-execution-assume-role.json`)
    await sdk.exec(`aws iam --region ${region} attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy`)
  } catch (err) {
    if (err.message.includes('EntityAlreadyExists')) {
      return
    }
    throw err
  }
}

/**
 * configureCluster configures a new FARGATE cluster.
 *
 * @param {string} region The region to create the cluster in
 *
 * @return {object} An object containing the subnet ids and group id
 */
async function configureCluster(region) {
  const subnets = []
  let vpcId = ''
  let groupId = ''

  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Configuring cluster'))
    await sdk.exec(`ecs-cli configure --cluster jupyter --default-launch-type FARGATE --region ${region} --config-name jupyter-config`)
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))

  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Spinning up cluster. This may take a few minutes'))
    await childProc(
      'ecs-cli',
      ['up', '-f', '--ecs-profile', 'jupyter-profile', '--cluster-config', 'jupyter-config'],
      // Custom callback to parse stdout and retrieve subnet and vpc ids
      function (data) {
        const s = `${data}`;
        if (s.includes('subnet')) {
          subnets.push(s.substring(16, 40))
        }

        if (s.includes('vpc')) {
          vpcId = s.substring(13, 34)
        }
      }
    )
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))

  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Retrieving security group ID'))
    await childProc(
      'aws',
      ['ec2', 'describe-security-groups', '--filters', `Name=vpc-id,Values=${vpcId}`, '--region', region],
      // Custom callback to parse stdout and retrieve the group id
      function (data) {
        const s = `${data}`
        const regex = /(sg-.*)\"/g;
        const match = regex.exec(s)
        if (match && match[1]) {
          groupId = match[1]
        }
      }
    )
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))
  sdk.log(ux.colors.blue('\nAWS ECS cluster configured successfully!\n'))

  ux.spinner.start(ux.colors.blue("Allowing inbound access on port 8888"))
  await childProc('aws', ['ec2', 'authorize-security-group-ingress', '--group-id', groupId, '--protocol', 'tcp', '--port', '8888', '--cidr', '0.0.0.0/0', '--region', region])
  ux.spinner.stop(ux.colors.blue('Done!'))

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
  sdk.log(ux.colors.blue("\nUsing docker-compose.yml with contents:\n"))
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
  sdk.log(ux.colors.blue("\nUsing ecs-params.yml with contents:\n"))
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
    ux.spinner.start(ux.colors.blue("Booting JupyterLab instance"))
    await sdk.exec(`ecs-cli compose --project-name jupyter --file docker-compose.yml service up --ecs-profile ecs-params.yml --cluster-config jupyter-config`)

    // Retrieve the IP of our instance from AWS
    await childProc(
      'ecs-cli',
      ['compose', '--project-name', 'jupyter', 'service', 'ps', '--ecs-profile', 'ecs-params.yml', '--cluster', 'jupyter', '--cluster-config', 'jupyter-config'],
      // Custom callback to process stdout
      function (data) {
        // Match any IP address
        const regex = /(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g;
        const match = regex.exec(data)
        if (match && match[1]) {
          ip = match[1];
        }
      }
    )
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))

  sdk.log('Successfully deployed Jupyter Lab to AWS! You can access it', ux.url('here', `http://${ip}:8888/?token=${token}`))
}

/**
 * Destroy removes any running tasks and services within the jupyter project
 * before removing our cluster.
 *
 * @param {object} creds Optional object containing credentials for AWS
 */
async function Destroy(creds) {
  // Should we use the previously entered credentials for DigitalOcean?
  const useOld = await useOldCreds(creds, 'AWS')

  const { keyId, key, region } = await ux.prompt(
    useOld
    ? awsEssentialPrompts.slice(2)
    : awsEssentialPrompts
  )

  if (!useOld) storeCreds({ keyId, key })

  try {
    // Configure our authentication credentials
    if (useOld) {
      await authenticateAWS(creds.AWS.keyId, creds.AWS.key, region, false)
    } else {
      await authenticateAWS(keyId, key, region, false)
    }

    sdk.log("")
    ux.spinner.start(ux.colors.blue("Tearing down AWS JupyterLab deployment"))

    // Copy docker-compose.yml and ecs-params.yml to our current working directory
    await sdk.exec('cp /root/.config/@cto.ai/ops/platform-solutions/jupyter/config/* .')

    // Remove any running tasks and services
    await childProc(
      'ecs-cli',
      ['compose', '--project-name', 'jupyter', 'service', 'rm', '--cluster-config', 'jupyter-config'],
      // This command prints errors to stdout. So parse the output for errors
      function (data) {
        const s = `${data}`
        if (s.includes('level=error') || s.includes('level=fatal')) {
          throw new Error(data)
        }
      }
    )

    // Delete the cluster
    await sdk.exec('ecs-cli down -f --cluster-config jupyter-config')
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'AWS Destroy',
      error: `${err}`
    })
    return
  }

  await track({
    event: 'AWS Destroy',
    success: true,
  })

  ux.spinner.stop(ux.colors.blue("Done!"))
  sdk.log(ux.colors.blue("\nSuccessful teardown!"))
}

module.exports = {
  Create: Create,
  Destroy: Destroy,
};
