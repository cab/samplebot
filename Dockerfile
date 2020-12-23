FROM node:lts-alpine

RUN apk add --update-cache ffmpeg sqlite-dev python2 python2-dev build-base sqlite

WORKDIR /app
COPY ./ /app
RUN npm install