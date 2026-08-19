FROM node:22-alpine

WORKDIR /app

COPY index.js .
COPY config.json .

CMD ["node", "index.js"]
