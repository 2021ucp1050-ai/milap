FROM node:22-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY src ./src
RUN mkdir -p /app/data/uploads

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL=file:/app/data/milap.db
ENV UPLOAD_DIR=/app/data/uploads

EXPOSE 4000
CMD ["node", "src/index.js"]
