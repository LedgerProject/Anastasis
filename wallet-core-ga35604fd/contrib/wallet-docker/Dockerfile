FROM debian:bullseye AS walletbuild

# Install dependencies
RUN apt-get update
RUN apt-get -y upgrade
RUN apt-get -y install build-essential zip jq python3 python3-pip nodejs npm
RUN npm install -g pnpm

COPY gitbuild.sh /bin
