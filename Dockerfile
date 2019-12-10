############################
# Build container
############################
FROM node:10-alpine AS dep

WORKDIR /ops

RUN apk add python make
ADD package.json .
RUN npm install

ADD . .

############################
# Final container
############################
FROM node:10-alpine

RUN apk add ca-certificates docker curl python

# Download and install docker-machine
RUN wget https://github.com/docker/machine/releases/download/v0.14.0/docker-machine-$(uname -s)-$(uname -m) && \
    mv docker-machine-Linux-x86_64 docker-machine && \
    chmod +x docker-machine && \
    mv docker-machine /usr/local/bin

# Downloading gcloud package
RUN curl https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz > /tmp/google-cloud-sdk.tar.gz

# Installing the package
RUN mkdir -p /usr/local/gcloud \
  && tar -C /usr/local/gcloud -xvf /tmp/google-cloud-sdk.tar.gz \
  && /usr/local/gcloud/google-cloud-sdk/install.sh

# Adding the package path to local
ENV PATH $PATH:/usr/local/gcloud/google-cloud-sdk/bin

# Ensure beta component is installed so we can create K8s containers
RUN gcloud components install beta --quiet

# Install AWS ECS CLI
RUN curl -o /usr/local/bin/ecs-cli https://amazon-ecs-cli.s3.amazonaws.com/ecs-cli-linux-amd64-latest
RUN chmod +x /usr/local/bin/ecs-cli

# Install AWS CLI
RUN apk -v --update add \
        py-pip \
        groff \
        less \
        mailcap \
        && \
    pip install --upgrade awscli==1.14.5 s3cmd==2.0.1 python-magic && \
    apk -v --purge del py-pip && \
    rm /var/cache/apk/*

WORKDIR /ops

COPY --from=dep /ops .
