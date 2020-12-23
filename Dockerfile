FROM node:lts

RUN apt update -y
RUN apt install -y ffmpeg libsqlite-dev python python-dev build-essential sqlite

WORKDIR /app
COPY ./ /app
RUN npm install