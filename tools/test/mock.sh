#!/bin/bash
# Lokalni Supabase mock (Deno). Upotreba: tools/test/mock.sh start|stop
# DENO = putanja do deno binarnog fajla (podrazumevano `deno` iz PATH-a).
T="$(cd "$(dirname "$0")" && pwd)"; DENO=${DENO:-deno}; PID=/tmp/eparhija-mock.pid
case $1 in
 stop) [ -f $PID ] && kill $(cat $PID) 2>/dev/null; rm -f $PID;;
 start) cd $T && setsid nohup $DENO run -A --config $T/../../supabase/functions/order/deno.json supa.ts >/tmp/eparhija-mock.log 2>&1 & echo $! > $PID; sleep 3;;
esac
