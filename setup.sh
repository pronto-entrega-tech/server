#!/bin/bash

# Setup the servers

# Set environment variables
for entries in $(cat .env); do
    export $entries
done

ansible-playbook -i ansible/inventory.yaml -K ansible/main-playbook.yaml