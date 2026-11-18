# Image Node.js légère (alpine), comme dans les tutoriels du cours
FROM node:22-alpine

WORKDIR /app

# On copie d'abord la liste des dépendances et on les installe
# (Docker garde cette étape en cache tant que package.json ne change pas)
COPY package.json ./
RUN npm install --omit=dev

# Puis le code du serveur et du site
COPY server ./server
COPY public ./public

EXPOSE 3000
CMD ["node", "server/index.js"]
