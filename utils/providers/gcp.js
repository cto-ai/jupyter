const { ux, sdk } = require('@cto.ai/sdk')
const { childProc, track } = require('../helpers')
const { spawn } = require('child_process')
const {
  continuePrompts,
  gcpZone,
  gcpProjectPrompt,
  gcpGPU,
  gcpGPUImage,
  gcpCPUImage,
  gcpVerification,
} = require('../../prompts');

/**
 * Create handles the creation of our GCP JupyterLab deployment.
 */
async function Create() {
  sdk.log(ux.colors.blue('\nCreating Google Cloud Docker deployment...\n'))

  try {
    await authenticateGCP()
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'GCP Authentication - Creation',
      error: `${err}`
    })
    return
  }

  // Should we deploy with a GPU?
  const { useGPU } = await ux.prompt(gcpGPU)
  const { image } = await ux.prompt(useGPU ? gcpGPUImage : gcpCPUImage)

  // Which zone should we use?
  const { zone } = await ux.prompt(gcpZone)

  try {
    if (useGPU) {
      await deployGPU(image, zone)
    } else {
      await deployCPU(image, zone)
    }
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'GCP Deployment',
      error: `${err}`
    })
    return
  }

  const url = await fetchJupyterLabURL(zone)
  await track({
    event: 'GCP Deployment',
    success: true
  })
  sdk.log(`Successfully setup JupyterLab! You can access your instance at https://${url}`)
}

/**
 * fetchJupyterLabURL waits for the Jupyter instance's proxy connection to
 * initialize and then returns the proxy URL.
 *
 * @param {string} zone The zone that the instance resides in
 *
 * @return {string} The proxy URL created by Google
 */
async function fetchJupyterLabURL(zone) {
  sdk.log("")
  ux.spinner.start(ux.colors.blue('Waiting for Jupyter instance proxy to initialize. This may take a few minutes'))

  // Initialize a function to wait for a given duration
  const timeout = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  let url = ''
  while (!url) {
    // Retrieve the instance description and run a regex query to see if
    // the proxy URL has been added yet
    await childProc(
      'gcloud',
      ['compute', 'instances', 'describe', 'jupyter', '--zone', zone],
      // Callback to process stdout data
      function (data) {
        const regex = /value: (.*\.notebooks.googleusercontent.com)/g
        const match = regex.exec(data)
        // Proxy URL found
        if (match && match[1]) {
          url = match[1]
        }
      }
    )
    // Rate limit query to five seconds if the url has not been found yet
    if (!url) timeout(5000)
  }
  ux.spinner.stop(ux.colors.blue('Done!'))
  return url
}

/**
 * authenticateGCP prompts the user to retrieve a verification code from Google
 * and enter it for us to authenticate their account within the op container.
 */
async function authenticateGCP() {
  try {
    // This gcloud auth command only outputs to stderr, so treat it as stdout
    await new Promise(async (resolve, reject) => {
      const auth = spawn('gcloud', ['auth', 'login', '--no-launch-browser'])

      // The auth command prints out its own code entry prompt, so match the
      // text to retrieve the auth URL and only display that portion of output
      // to the user
      auth.stderr.on('data', async data => {
        // Reject the promise if the user entered an incorrect token
        if (`${data}`.includes('ERROR')) {
          reject(new Error(`${data}`));
        }
        // Match any URL
        const regex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g
        const match = regex.exec(data)

        if (match) {
          sdk.log("Please go to the following link in your browser to authenticate:\n")
          sdk.log(match[0])
          sdk.log("")

          const { code } = await ux.prompt(gcpVerification)
          auth.stdin.write(`${code}\n`) // Write the entered code to stdin
        }
      });

      auth.on('close', () => {
        resolve();
      });
    });
  } catch (err) {
    throw err
  }
  sdk.log(ux.colors.blue("\nAuthentication with Google Cloud successful!"))

  await selectProject()
}

/**
 * selectProject sets the project selected by the user within the gcloud CLI.
 */
async function selectProject() {
  const { project } = await ux.prompt(gcpProjectPrompt)
  await sdk.exec(`gcloud config set project ${project}`)
}

/**
 * deployCPU deploys a new CPU based JupyterLab instance to GCP.
 *
 * @param {string} image The JupyterLab docker image to use
 * @param {string} zone  The zone to deploy the instance in
 */
async function deployCPU(image, zone) {
  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Deploying Google Cloud instance. This may take a few minutes'))
    await sdk.exec(`gcloud compute instances create jupyter --zone ${zone} --image-family ${image} --image-project deeplearning-platform-release --scopes=https://www.googleapis.com/auth/cloud-platform --metadata "proxy-mode=project_editors" --tags http-server,https-server`)
    ux.spinner.stop(ux.colors.blue('Done!'))
  } catch (err) {
    throw err
  }
}

/**
 * deployGPU deploys a new JupyterLab instance with a GPU on GCP.
 *
 * @param {string} image The JupyterLab docker image to use
 * @param {string} zone  The zone to deploy the instance in
 */
async function deployGPU(image, zone) {
  try {
    sdk.log("")
    ux.spinner.start(ux.colors.blue('Deploying Google Cloud instance. This may take a few minutes'))
    await sdk.exec(`gcloud compute instances create jupyter --zone ${zone} --image-family ${image} --image-project deeplearning-platform-release --maintenance-policy TERMINATE --accelerator "type=nvidia-tesla-v100count=1" --metadata "install-nvidia-driver=True,proxy-mode=project_editors" --scopes=https://www.googleapis.com/auth/cloud-platform --tags http-server,https-server`)
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    throw err
  }
  ux.spinner.stop(ux.colors.blue('Done!'))
}

/**
 * Destroy deletes our GCP jupyter instance.
 */
async function Destroy() {
  sdk.log("")
  try {
    await authenticateGCP()
  } catch (err) {
    sdk.log(ux.colors.red(err))
    await track({
      event: 'GCP Authentication - Destroy',
      error: `${err}`
    })
    return
  }
  const { zone } = await ux.prompt(gcpZone)

  sdk.log("")
  try {
    ux.spinner.start(ux.colors.blue('Tearing down GCP JupyterLab deployment'))
    await sdk.exec(`gcloud compute instances delete jupyter --zone ${zone} --quiet`)
    await track({
      event: 'GCP Destroy',
      success: true,
    })
    ux.spinner.stop(ux.colors.blue('Done!'))
  } catch (err) {
    ux.spinner.stop(ux.colors.red('ERROR!'))
    console.error("Error tearing down instance. Check to ensure you selected the correct zone that the 'jupyter' instance resides in.")
    await track({
      event: 'GCP Destroy',
      error: `${err}`
    })
  }
}

module.exports = {
  Create: Create,
  Destroy: Destroy,
};
