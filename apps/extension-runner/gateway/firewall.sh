#!/bin/sh
set -eu
# This namespace is shared with exactly one unprivileged extension container.
# IPv6 is denied entirely until equivalent routing and local grants are supported.
ip6tables -P OUTPUT DROP
ip6tables -P INPUT DROP
iptables -P OUTPUT DROP
iptables -P INPUT DROP
iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
# Never allow loopback, Docker networks, metadata, multicast or reserved targets.
for cidr in 0.0.0.0/8 127.0.0.0/8 169.254.0.0/16 224.0.0.0/4 240.0.0.0/4; do
  iptables -A OUTPUT -d "$cidr" -j REJECT
done
# Addresses of application networks are injected by the runner, not the package.
for cidr in $PROTECTED_NETWORKS; do iptables -A OUTPUT -d "$cidr" -j REJECT; done
for endpoint in $LOCAL_ENDPOINTS; do
  addr="${endpoint%:*}"; port="${endpoint##*:}"
  iptables -A OUTPUT -d "$addr" -p tcp --dport "$port" -j ACCEPT
  iptables -A OUTPUT -d "$addr" -p udp --dport "$port" -j ACCEPT
done
for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 100.64.0.0/10 192.0.0.0/24 192.0.2.0/24 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24; do
  iptables -A OUTPUT -d "$cidr" -j REJECT
done
if [ "$INTERNET" = "1" ]; then
  iptables -A OUTPUT -p tcp -j ACCEPT
  iptables -A OUTPUT -p udp -j ACCEPT
fi
printf 'ready\n'
exec sleep infinity
