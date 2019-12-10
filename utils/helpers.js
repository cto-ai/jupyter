const { sdk, ux } = require('@cto.ai/sdk')
const { spawn } = require('child_process')
const path = require('path');
const fs = require('fs');
const { mappings } = require('../config/imageMappings');
const { updateConfigPrompt } = require('../prompts');

const OP_CONFIG = '/root/.config/@cto.ai/ops/platform-solutions/jupyter/config';
const validFlags = [
  '-c', '--create',
  '-d', '--destroy',
  '-gcp', '--google',
  '-aws', '--aws',
  '-do', '--digitalocean',
  '--build',
]

/**
 * processFlags validates runtime the flags and returns the flow and provider.
 *
 * @return {object} The name of the flow and the provider to use
 */
function processFlags() {
  // Process passed arguments
  const argv = process.argv
  const flags = argv && argv.length ? argv.filter(arg => arg.startsWith('-')) : []

  // Validate the passed flags
  flags.map(f => {
    if (!validFlags.includes(f)) {
      throw new Error(`Invalid flag passed! \nValid flags include ${validFlags}
      
      Exiting...`)
    }
  })

  const res = {
    flow: null,
    provider: null,
  }

  flags.map(flag => {
    switch (flag) {
      case '-c':
      case '--create':
        res.flow = 'Create'
        break;
      case '-d':
      case '--destroy':
        res.flow = 'Destroy'
        break;
      case '-do':
      case '--digitalocean':
        res.provider = 'DigitalOcean'
        break;
      case '-gcp':
      case '--google':
        res.provider = 'Google Cloud'
        break;
      case '-aws':
      case '--amazon':
        res.provider = 'Amazon Web Services'
        break;
      default:
        break;
    }
  })

  if (!(res.flow && res.provider)) {
    throw new Error("Must specify one of --create or --destroy as well as a provider [-do | -gcp | -aws]")
  }
  return res
}

/**
 * childProc spawns a new child process so we can log stdout and stderr.
 *
 * @param {string}   command The main shell command to run
 * @param {array}    args    The arguments to pass to the command
 * @param {function} cb      Optional callback function to run on stdout data
 */
const childProc = (command, args, cb) => {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args);

    if (cb) {
      proc.stdout.on('data', data => cb(data))
    } else {
      proc.stdout.on('data', data => {
        sdk.log(`${data}`);
      });
    }

    proc.stderr.on('data', data => {
      console.error(`${data}`);
      reject();
    });
    proc.on('close', () => {
      resolve();
    });
  });
}

/**
 * writeToFileSync syncronously writes data to a file.
 *
 * @param {string}        dirPath  The directory to write to
 * @param {string}        fileName The name of the file to write to
 * @param {string|Buffer} data The data to write
 */
const writeToFileSync = ({
  dirPath,
  fileName,
  data,
}) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
    const filePath = path.resolve(dirPath, fileName)
    fs.writeFileSync(filePath, data, 'utf8')
  } catch (err) {
    console.error('Error writing file:', err)
  }
}

/**
 * getImageName maps the DockerHub image name to the given JupyterLab build type.
 *
 * @param {string} kernel The name of the kernel to select the image for
 *
 * @return {string} The name of the DockerHub image
 */
const getImageName = kernel => {
  const image = mappings[kernel]
  if (!image) {
    return 'jupyter/base-notebook'
  }
  return image
}

/**
 * track adds tracking metadata for events in this op.
 *
 * @param {object} trackingData The tracking metadata to include with the track
 */
const track = async trackingData => {
  const { me } = await sdk.user()
  const metadata = {
    user: {
      ...me,
    },
    os: sdk.getHostOS(),
    event: `Jupyter Op - ${trackingData.event}`,
    ...trackingData,
  }
  await sdk.track(['track', 'jupyter'], metadata)
}

/**
 * findCreds looks for saved cloud provider credentials in the
 * OP_CONFIG directory.
 */
const findCreds = () => {
  let aws = {}
  let dOcean = {}
  if (!fs.existsSync(OP_CONFIG)) {
    return {
      "DO": dOcean,
      "AWS": aws,
    }
  }

  if (fs.existsSync(`${OP_CONFIG}/do.json`)) {
    dOcean = JSON.parse(fs.readFileSync(`${OP_CONFIG}/do.json`, "utf8"));
  }
  if (fs.existsSync(`${OP_CONFIG}/aws.json`)) {
    aws = JSON.parse(fs.readFileSync(`${OP_CONFIG}/aws.json`, "utf8"));
  }

  return {
    "DO": dOcean,
    "AWS": aws,
  }
}

/**
 * useOldCreds tells us if a user wants to use their previously entered creds.
 *
 * @param {object} creds Credentials for DigitalOcean
 * @param {string} provider The provider to check for creds. One of 'DO' or 'AWS'
 *
 * @return The boolean value of if we should use the old credentials
 */
async function useOldCreds(creds, provider) {
  const haveToken = creds && Object.keys(creds[provider]).length
  if (!haveToken) {
    return false
  }

  const { useOld } = await ux.prompt(updateConfigPrompt)
  return useOld
}

/**
 * storeCreds writes our token to the config file.
 *
 * @param {string} data The credential object to store
 * @param {string} provider The provider to store credentials for
 */
function storeCreds(data, provider) {
  writeToFileSync({
    dirPath: '/root/.config/@cto.ai/ops/platform-solutions/jupyter/config',
    fileName: provider === 'DO' ? 'do.json' : 'aws.json',
    data: JSON.stringify(data)
  })
}

module.exports = {
  processFlags,
  writeToFileSync,
  getImageName,
  childProc,
  track,
  findCreds,
  useOldCreds,
  storeCreds,
};
