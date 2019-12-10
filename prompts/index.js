const { ux } = require('@cto.ai/sdk');
const { DO_INSTANCES } = require('../constants');

const { white, reset } = ux.colors;

const flowPrompt = [
  {
    type: 'list',
    name: 'flow',
    message: `\nAre you looking to create or destroy a JupyterLab Server? ${reset.green(
      '→',
    )}`,
    choices: [
      'Create',
      'Destroy',
    ],
    afterMessage: `${reset.green('✓')}`,
  },
  {
    type: 'list',
    name: 'provider',
    message: `\nWhich cloud provider would you like to use?${reset.green(
      '→',
    )}`,
    choices: [
      'DigitalOcean',
      'Google Cloud',
      'Amazon Web Services',
    ],
    afterMessage: `${reset.green('✓')}`,
  },
]

const kernelPrompt = {
  type: 'list',
  name: 'kernel',
  message: `\nPlease select the base image to use. More details ${ux.url('here', 'https://jupyter-docker-stacks.readthedocs.io/en/latest/using/selecting.html')}${reset.green(
    '→',
  )}`,
  choices: [
    'Base',
    'Minimal',
    'R',
    'SciPy',
    'Tensorflow',
    'Datascience (Julia/Python/R)',
    'PySpark (SciPy image with support for Spark)',
    'All Spark (Most comprehensive; Python, R, Scala, Julia, SciPy)',
  ],
  afterMessage: `${reset.green('✓')}`,
}

const passwordPrompt = {
  type: 'input',
  name: 'password',
  message: `\nPlease enter a password/token to use for logging into Jupyter\n${reset.green(
    '→',
  )}`,
  validate: function(input) {
    if (input) {
      return true
    }
    return 'You must provide a password'
  },
  afterMessage: `${reset.green('✓')} password`,
  afterMessageAppend: `${reset(' added!')}`,
}

const digitalOceanTokenPrompt = [
  {
    type: 'input',
    name: 'token',
    message: `\nPlease enter your DigitalOcean API Access Token\n${reset.green(
      '→',
    )}`,
    validate: function(input) {
      if (input) {
        return true
      }
      return 'You must provide an access token'
    },
    afterMessage: `${reset.green('✓')} Access Token`,
    afterMessageAppend: `${reset(' added!')}`,
  },
]

const continuePrompts = [
  {
    type: 'input',
    name: 'continue',
    message: `\nPress enter to continue →`,
    afterMessage: ' ',
    transformer: input => ' ',
  },
]

const digitalOceanPrompts = [
  passwordPrompt,
  kernelPrompt,
  {
    type: 'list',
    name: 'size',
    message: `\nWhat size droplet would you like? \n${reset.green(
      '→',
    )}`,
    choices: DO_INSTANCES,
    afterMessage: `${reset.green('✓')} Droplet size`,
    afterMessageAppend: `${reset(' selected!')}`,
  },
  ...digitalOceanTokenPrompt,
]

const gcpVerification = [
  {
    type: 'input',
    name: 'code',
    message: `\nEnter verification code ${reset.green(
      '→',
    )}`,
    validate: function(input) {
      if (input) {
        return true
      }
      return 'You must provide a valid verification code'
    },
    afterMessage: `${reset.green('✓')} code added!`,
  }
]

const gcpProjectPrompt = [
  {
    type: 'input',
    name: 'project',
    message: `\nPlease input the name of your Google Cloud project ${reset.green(
      '→',
    )}`,
    validate: function(input) {
      // Ensure the provided project name follows the format necessary
      const regex = /([-a-z0-9]*[a-z0-9])/g
      const match = regex.exec(input)
      if (input && match) {
        return true
      }
      return 'You must provide a valid Google Cloud project name'
    },
    afterMessage: `${reset.green('✓')} using project`,
    afterMessageAppend: `${reset('!')}`,
  },
]

const gcpGPU = [
  {
    type: 'confirm',
    name: 'useGPU',
    message: `\nWould you like to use an instance with a GPU? (this will cost more) ${reset.green(
      '→',
    )}`,
  }
]

const gcpZone = [
  {
    type: 'list',
    name: 'zone',
    message: `\nPlease select the zone to use ${reset.green(
      '→',
    )}`,
    choices: [
      'us-west1-a',
      'us-west1-b',
      'us-west1-c',
      'us-west2-a',
      'us-west2-b',
      'us-west2-c',
      'us-east1-b',
      'us-east1-c',
      'us-east1-d',
      'us-east4-a',
      'us-east4-b',
      'us-east4-c',
      'us-central1-a',
      'us-central1-b',
      'us-central1-c',
      'us-central1-f',
      'southamerica-east1-a',
      'southamerica-east1-b',
      'southamerica-east1-c',
      'northamerica-northeast1-a',
      'northamerica-northeast1-b',
      'northamerica-northeast1-c',
      'europe-north1-a',
      'europe-north2-b',
      'europe-north2-c',
      'europe-west1-b',
      'europe-west1-c',
      'europe-west1-d',
      'europe-west2-a',
      'europe-west2-b',
      'europe-west2-c',
      'europe-west3-a',
      'europe-west3-b',
      'europe-west3-c',
      'europe-west4-a',
      'europe-west4-b',
      'europe-west4-c',
      'europe-west6-a',
      'europe-west6-b',
      'europe-west6-c',
      'australia-southeast1-a',
      'australia-southeast1-b',
      'australia-southeast1-c',
      'asia-southeast1-a',
      'asia-southeast1-b',
      'asia-southeast1-c',
      'asia-south1-a',
      'asia-south1-b',
      'asia-south1-c',
      'asia-northeast1-a',
      'asia-northeast1-b',
      'asia-northeast1-c',
      'asia-northeast2-a',
      'asia-northeast2-b',
      'asia-northeast2-c',
      'asia-east1-a',
      'asia-east1-b',
      'asia-east1-c',
      'asia-east2-a',
      'asia-east2-b',
      'asia-east2-c',
    ],
    afterMessage: `${reset.green('✓')}`,
  }
]

const gcpCPUImage = [
  {
    type: 'list',
    name: 'image',
    message: `\nPlease select the base image to use. More details ${ux.url('here', 'https://cloud.google.com/ai-platform/deep-learning-vm/docs/images')}${reset.green(
      '→',
    )}`,
    choices: [
      'common-cpu',
      'tf-latest-cpu',
      'tf-ent-latest-cpu',
      'tf2-latest-cpu',
      'pytorch-latest-cpu',
      'r-latest-cpu-experimental',
      'chainer-latest-cpu-experimental',
      'xgboost-latest-cpu-experimental',
      'mxnet-latest-cpu-experimental',
      'cntk-latest-cpu-experimental',
      'caffe1-latest-cpu-experimental',
    ],
    afterMessage: `${reset.green('✓')}`,
  }
]

const gcpGPUImage = [
  {
    type: 'list',
    name: 'image',
    message: `\nPlease select the base image to use. More details ${ux.url('here', 'https://cloud.google.com/ai-platform/deep-learning-vm/docs/images')}${reset.green(
      '→',
    )}`,
    choices: [
      'common-cu101',
      'common-cu100',
      'common-cu92',
      'common-cu91',
      'common-cu90',
      'tf-latest-gpu',
      'tf-ent-latest-gpu',
      'tf2-latest-gpu',
      'pytorch-latest-gpu',
      'rapids-latest-gpu-experimental',
      'chainer-latest-gpu-experimental',
      'xgboost-latest-gpu-experimental',
      'mxnet-latest-gpu-experimental',
      'cntk-latest-gpu-experimental',
      'caffe1-latest-gpu-experimental',
    ],
    afterMessage: `${reset.green('✓')}`,
  }
]

const awsEssentialPrompts = [
  {
    type: 'input',
    name: 'keyId',
    message: `\nPlease enter your AWS access key id ${reset.green(
      '→',
    )}`,
    validate: function(input) {
      if (input) {
        return true
      }
      return 'You must provide a valid AWS access key'
    },
    afterMessage: `${reset.green('✓')} id`,
    afterMessageAppend: `${reset(' added!')}`,
  },
  {
    type: 'input',
    name: 'key',
    message: `\nPlease enter your AWS secret access key ${reset.green(
      '→',
    )}`,
    validate: function(input) {
      if (input) {
        return true
      }
      return 'You must provide a valid secret access key'
    },
    afterMessage: `${reset.green('✓')} key`,
    afterMessageAppend: `${reset(' added!')}`,
  },
  {
    type: 'list',
    name: 'region',
    message: `\nPlease select the region to use ${reset.green(
      '→',
    )}`,
    choices: [
      'us-east-2',
      'us-east-1',
      'us-west-1',
      'us-west-2',
      'ap-east-1',
      'ap-south-1',
      'ap-northeast-3',
      'ap-northeast-2',
      'ap-northeast-1',
      'ap-southeast-2',
      'ap-southeast-1',
      'ap-northeast-1',
      'ca-central-1',
      'cn-north-1',
      'cn-northwest-1',
      'eu-central-1',
      'eu-west-1',
      'eu-west-2',
      'eu-west-3',
      'eu-north-1',
      'me-south-1',
      'sa-east-1',
      'us-gov-east-1',
      'us-gov-west-1',
    ],
    afterMessage: `${reset.green('✓')}`,
  },
]

const awsPrompts = [
  ...awsEssentialPrompts,
  passwordPrompt,
  kernelPrompt,
]

const updateConfigPrompt = [
  {
    type: 'confirm',
    name: 'useOld',
    message: `\nWould you like to use the same credentials as your last run? ${reset.green(
      '→',
    )}`,
  }
]

module.exports = {
  flowPrompt,
  kernelPrompt,
  passwordPrompt,
  continuePrompts,
  digitalOceanPrompts,
  digitalOceanTokenPrompt,
  gcpVerification,
  gcpZone,
  gcpProjectPrompt,
  gcpGPU,
  gcpCPUImage,
  gcpGPUImage,
  awsEssentialPrompts,
  awsPrompts,
  updateConfigPrompt,
};
