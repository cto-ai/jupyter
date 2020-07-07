const { ux, sdk } = require('@cto.ai/sdk')
const { LOGO } = require('./constants');
const { flowPrompt } = require('./prompts');
const providers = require('./utils/providers');
const { track } = require('./utils/helpers');
const util = require('util');

const main = async () => {
  const greeting = `\n👋  Welcome to the Jupyter Notebook initalizer 👋\n\n`

  const runtime = await sdk.getInterfaceType();
  if (runtime == 'terminal') { ux.print(LOGO) }
  await ux.print(greeting)

  // Should we setup or teardown
  const { action } = await ux.prompt(flowPrompt[0])
  const { provider } = await ux.prompt(flowPrompt[1])
  await ux.print(provider);

  let creds = {}
  //switch (provider) {
  //  case 'DigitalOcean':
  //    await action == 'Create' ? providers.DO.Create(creds) : providers.DO.Destroy(creds);
  //    break;
  //  case 'Google Cloud':
  //    await action == 'Create' ? providers.GCP.Create() : providers.GCP.Destroy();
  //    break;
  //  case 'Amazon Web Services':
  //    // Basic necessary credentials.
  //    creds = {
  //      keyId: await sdk.getSecret('AWS_ACCESS_KEY_ID'),
  //      key: await sdk.getSecret('AWS_SECRET_ACCESS_KEY'),
  //    }
  //    await action == 'Create' ? providers.AWS.Create(creds) : providers.AWS.Destroy(creds);
  //    break;
  //  default:
  //    sdk.log('Invalid cloud provider selected!')
  //    track({
  //      event: 'Cloud provider selection',
  //      error: `Invalid cloud provider selected - ${provider}`
  //    })
  //    return
  //}

  // Need to use if/else block to assign vars in arms based on sdk.getSecret.
  if (provider == 'DigitalOcean') {
    console.log('digital')
  } else if (provider == 'Google Cloud') {
    console.log('google')
  } else if (provider == 'Amazon Web Services') {
    // Basic necessary credentials.
    const { AWS_ACCESS_KEY_ID } = await sdk.getSecret('AWS_ACCESS_KEY_ID')
    const { AWS_SECRET_ACCESS_KEY } = await sdk.getSecret('AWS_SECRET_ACCESS_KEY')
    creds = {
      keyId: AWS_ACCESS_KEY_ID,
      key: AWS_SECRET_ACCESS_KEY,
    }
    await action == 'Create' ? providers.AWS.Create(creds) : providers.AWS.Destroy(creds);
  } else {
    sdk.log('Invalid cloud provider selected!')
    track({
      event: 'Cloud provider selection',
      error: `Invalid cloud provider selected - ${provider}`
    })
  }
}

main()
