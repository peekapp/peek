FROM alpine:3.23
RUN apk add --no-cache iptables
COPY firewall.sh /firewall.sh
ENTRYPOINT ["sh", "/firewall.sh"]
