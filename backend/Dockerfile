FROM node:22-alpine AS deps
WORKDIR /app
# python3/make/g++ are needed to build argon2's native bindings; the toolchain
# is dropped on the runner stage since we only COPY node_modules over.
RUN apk add --no-cache openssl python3 make g++
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npx nest build
RUN npx tsc prisma/seed.ts --outDir dist-seed --esModuleInterop --skipLibCheck --target ES2022 --module commonjs

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl bash
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-seed ./dist-seed
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY jest.config.cjs ./
COPY --from=build /app/package.json ./
COPY entrypoint.sh ./
RUN chmod +x ./entrypoint.sh
EXPOSE 4000
CMD ["./entrypoint.sh"]
