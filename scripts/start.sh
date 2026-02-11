#!/bin/bash
sudo systemctl start rasp-cast
echo "Rasp-Cast started"
sudo systemctl status rasp-cast --no-pager
