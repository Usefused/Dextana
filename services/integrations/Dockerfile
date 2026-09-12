# Supply a verified Linux fused-cli binary using a named build context:
# docker build --build-context fusedcli=/path/to/linux-cli-dir -t dext-integrations .
# Mount the built Fused billing SDK with its dependencies read-only at runtime;
# FUSED_BILLING_SDK_MODULE must point to its entry point inside the container.
FROM node:24-bookworm-slim
WORKDIR /service
COPY --from=fusedcli --chmod=755 fused-cli /usr/local/bin/fused-cli
COPY package.json ./
COPY src ./src
COPY catalog ./catalog
RUN mkdir /service/var && chown node:node /service/var
USER node
ENV HOST=0.0.0.0 PORT=8787 DATA_DIR=/service/var
EXPOSE 8787
CMD ["npm", "start"]
