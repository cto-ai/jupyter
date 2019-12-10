# 🚀 CTO.ai - Official Op - Jupyter 🚀

An Op to create and destroy JupyterLab Servers for use in data science.

## Requirements

To run this or any other Op, install the [Ops Platform](https://cto.ai/platform).

Find information about how to run and build Ops via the [Ops Platform Documentation](https://cto.ai/docs/overview).

This Op requires credentials based on which cloud service you would like to deploy to. Instructions for acquiring the credentials for Google Cloud, AWS, or DigitalOcean follows (you only need creds for one).

### For AWS

- **AWS Access Key Id**: Generate via: `AWS Management Console` -> `Security Credentials` -> `Access Keys`
- **AWS Access Key Secret**: Generate via: `AWS Management Console` -> `Security Credentials` -> `Access Keys`

For more information on creating AWS access keys see [this guide](https://aws.amazon.com/premiumsupport/knowledge-center/create-access-key/).

### For DigitalOcean

- **DigitalOcean API Access Token**: Generate via : `API` -> `Personal access tokens` -> `Generate new token`

For more information on getting access tokens in Digital Ocean, see [this guide](https://www.digitalocean.com/docs/api/create-personal-access-token/).

### For Google Cloud

- Authentication will happen during the Op via a browser prompt.

## Usage

Running `ops run jupyter` will start an interactive prompt to select your deployment configuration.

You can specify creation or destruction of a deployment and the cloud provider at runtime via arguments. Examples include `ops run jupyter -s --google`. Run `ops run jupyter -h` for a breakdown of the valid flags.

## Local Development

To develop and run Ops locally:

  1. Clone the repo `git clone <git url>`
  2. `cd` into the repo directory and install dependancies with `npm install`
  3. Run the Op from your local source code with `ops run path/to/op`

## Resources

### JupyterLab

- [JupyterLab Documentation](https://jupyterlab.readthedocs.io/en/stable/)
- [Jupyter Docker Stacks](https://jupyter-docker-stacks.readthedocs.io/en/latest/)

### AWS

- [Getting Started on Amazon Web Services (AWS)](https://aws.amazon.com/getting-started/)

### DigitalOcean

- [Getting started with DigitalOcean](https://www.digitalocean.com/docs/getting-started/)

### Google Cloud

- [Deep Learning VM Documentation](https://cloud.google.com/ai-platform/deep-learning-vm/docs/)
