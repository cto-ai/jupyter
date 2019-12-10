const digitalOcean = require('./digitalOcean');
const gcp = require('./gcp');
const aws = require('./aws');

module.exports = {
  "DO": {
    "Create": digitalOcean.Create,
    "Destroy": digitalOcean.Destroy,
  },
  "AWS": {
    "Create": aws.Create,
    "Destroy": aws.Destroy,
  },
  "GCP": {
    "Create": gcp.Create,
    "Destroy": gcp.Destroy,
  },
};
