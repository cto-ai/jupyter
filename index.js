const { ux, sdk } = require('@cto.ai/sdk')
const { LOGO } = require('./constants');
const { flowPrompt, providerPrompt } = require('./prompts');
const providers = require('./utils/providers');
const { track, findCreds, processFlags } = require('./utils/helpers');

const main = async () => {
  const res = await sdk.user().catch(err => sdk.log(err))
  const person = res && res.me ? `, ${res.me.username}` : ' there'
  const greeting = `\n👋  Welcome to the Jupyter Notebook initalizer 👋\n\nHi${person}!`

  sdk.log(LOGO)
  sdk.log(greeting)

  const creds = findCreds()

  // Should we setup or teardown
  let setup
  let provider
  try {
    // Check if the user has passed runtime flow
    const initial = processFlags()

    // No flags passed, so prompt the user for what to do
    if (!Object.keys(initial)) {
      const answers = await ux.prompt(flowPrompt)
      setup = answers.flow == 'Create'
      provider = answers.provider
    } else {
      setup = initial.flow == 'Create'
      provider = initial.provider
    }
  } catch (err) {
    sdk.log(ux.colors.red(err.message))
    return
  }

  switch (provider) {
    case 'DigitalOcean':
      await setup ? providers.DO.Create(creds) : providers.DO.Destroy(creds);
      break;
    case 'Google Cloud':
      await setup ? providers.GCP.Create() : providers.GCP.Destroy();
      break;
    case 'Amazon Web Services':
      await setup ? providers.AWS.Create(creds) : providers.AWS.Destroy(creds);
      break;
    default:
      sdk.log('Invalid cloud provider selected!')
      track({
        event: 'Cloud provider selection',
        error: `Invalid cloud provider selected - ${provider}`
      })
      return
  }
}

main()
