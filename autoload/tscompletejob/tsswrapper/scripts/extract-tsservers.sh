#!/bin/bash
basedir=`dirname $0`;
for f in $(ls $basedir/../testdata/*.xz); do
    unxz -k ${f}
done
