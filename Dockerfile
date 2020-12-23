FROM rickydunlop/nodejs-ffmpeg

WORKDIR /app
COPY ./ /app
RUN npm install