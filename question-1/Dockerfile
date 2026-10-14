FROM node:22-alpine

WORKDIR /app
COPY . .

RUN npm ci
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 3000 8080

CMD ["npm", "start"]
