const { ux, sdk } = require('@cto.ai/sdk')
const {
  digitalOceanPrompts,
  digitalOceanTokenPrompt,
  continuePrompts,
} = require('../../prompts');
const {
  getImageName,
  childProc,
  track,
  writeToFileSync,
  useOldCreds,
  storeCreds,
} = require('../helpers');

/**
 * Create retrieves DigitalOcean specific info from the user and creates our
 * JupyterLab deployment.
 *
 * @param {object} creds Optional object containing credentials for DigitalOcean
 */
async function Create(creds) {
  // Ensure docker machine is removed
  try {
    await sdk.exec('docker-machine rm jupyter -y')
  } catch (err) {
    // If we see anything other than a 'this machine does not exist' error
    if (!err.message.includes('does not exist')) {
      console.error(err)
      await track({
        event: 'DigitalOcean remove docker-machine jupyter',
        error: `${err}`,
      })
      return
    }
  }

  // Should we use the previously entered credentials for DigitalOcean?
  const useOld = await useOldCreds(creds, 'DO')

  // Retrieve necessary information from the user
  const {
    password,
    kernel,
    size,
    token
  } = await ux.prompt(
    useOld
    ? digitalOceanPrompts.slice(0,t.length-1)
    : digitalOceanPrompts
  )
  const image = getImageName(kernel)

  if (!useOld) storeCreds({ token }, 'DO')

  try {
    await createMachine(useOld ? creds.DO.token : token, size)
    await run(image, password)
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'DigitalOcean Create',
      error: `${err}`,
    })
    return
  }

  await track({
    event: 'DigitalOcean Create',
    success: true,
  })
}

/**
 * createMachine creates a new DigitalOcean droplet for our JupyterLab deployment.
 *
 * @param {string} token The DigitalOcean secret token provided by the user
 * @param {string} size  The size of the droplet we will create
 */
async function createMachine(token, size) {
  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Creating DigitalOcean droplet'))
    await sdk.exec(`docker-machine create --digitalocean-size ${size} --driver digitalocean --digitalocean-access-token ${token} jupyter`)
    // Set the necessary environment variables for running the image later
    await sdk.exec('eval "$(docker-machine env --shell bash jupyter)"')
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))
}

/**
 * run SSHs into the droplet and runs the JupyterLab image.
 *
 * @param {string} image    The JupyterLab image to use
 * @param {string} password The token the user wants to use for Jupyter login
 */
async function run(image, password) {
  sdk.log(ux.colors.blue("\nRunning JupyterLab docker image...\n"))
  await childProc('docker-machine', ['ssh', 'jupyter', 'docker', 'run', '-d', '--rm', '-p', '80:8888', image, 'start.sh', 'jupyter', 'lab', `--LabApp.token='${password}'`])

  const url = await getJupyterIP()
  sdk.log("Done! You can access your JupyterLab intance", ux.url('here', `http://${url}/?token=${password}`))
}

/**
 * getJupyterURL retrieves the ip address of our 'jupyter' droplet.
 *
 * @return {string} The IP address
 */
async function getJupyterIP() {
  const { stdout } = await sdk.exec('docker-machine ip jupyter')
  return stdout.replace(/(\r\n|\n|\r)/gm, "")
}

/**
 * Destroy deletes our DigitalOcean droplet.
 *
 * @param {object} creds Optional object containing credentials for DigitalOcean
 */
const Destroy = async (creds) => {
  // Should we use the previously entered credentials for DigitalOcean?
  const useOld = await useOldCreds(creds, 'DO')

  const { token } = useOld ? creds.DO : await ux.prompt(digitalOceanTokenPrompt)

  if (!useOld) storeCreds({ token }, 'DO')

  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue("Tearing down JupyterLab deployment"))
    await sdk.exec(`docker-machine stop --driver digitalocean --digitalocean-access-token ${token} jupyter`)
    await sdk.exec('docker-machine rm jupyter -y')
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    sdk.log(ux.colors.red(err))
    await track({
      event: 'DigitalOcean Destroy',
      error: `${err}`
    })
    return
  }

  await track({
    event: 'DigitalOcean Destroy',
    success: true,
  })
  ux.spinner.stop(ux.colors.blue("Done!"))
}

module.exports = {
  Create: Create,
  Destroy: Destroy,
};
