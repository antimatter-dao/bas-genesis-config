FROM golang:1.18-alpine3.16 AS build
WORKDIR /build
RUN apk upgrade --no-cache \
    && apk add --no-cache \
    nodejs npm yarn git make python3 g++ musl-dev linux-headers bash
COPY package.json yarn.lock ./
RUN yarn
COPY . ./
RUN yarn compile
RUN go build -o /build/create-genesis -ldflags "-extldflags '-Wl,-z,stack-size=0x800000 -static'" -tags urfave_cli_no_docs,osusergo,netgo -trimpath ./

FROM alpine:3.16 AS run
WORKDIR /build
COPY --from=build /build/create-genesis /build/create-genesis
RUN chmod +x /build/create-genesis
ENTRYPOINT ["/build/create-genesis"]
