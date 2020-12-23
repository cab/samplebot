FROM jrottenberg/ffmpeg:3.3-alpine
FROM node:lts-alpine

# copy ffmpeg bins
COPY --from=0 / /

RUN apk add --update-cache sqlite-dev python2 python2-dev build-base sqlite

WORKDIR /app
COPY ./ /app
RUN npm install