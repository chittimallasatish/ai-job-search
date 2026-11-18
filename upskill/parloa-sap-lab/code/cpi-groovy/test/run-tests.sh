#!/usr/bin/env bash
# Runs the CPI Groovy scripts locally against stub SAP classes (no tenant needed).
# Usage: ./run-tests.sh      (needs Java 11+; downloads Groovy 4 jars once)
set -euo pipefail
cd "$(dirname "$0")"
V=4.0.24
for a in groovy groovy-json; do
  [ -f "$a-$V.jar" ] || curl -sSfLO "https://repo1.maven.org/maven2/org/apache/groovy/$a/$V/$a-$V.jar"
done
java -cp "groovy-$V.jar:groovy-json-$V.jar:stubs" groovy.ui.GroovyMain run.groovy ..
