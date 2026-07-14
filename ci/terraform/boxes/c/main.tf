terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "1.66.0"
    }
  }
}

variable "hetzner_api_token" {
  type      = string
  sensitive = true
}
variable "hetzner_plan" { type = string }
variable "hetzner_location" { type = string }
variable "hetzner_image" {
  type    = string
  default = "debian-12"
}
variable "hetzner_ssh_key_ids" {
  type    = list(string)
  default = []
}
variable "user_data" {
  type      = string
  sensitive = true
}

provider "hcloud" { token = var.hetzner_api_token }

resource "hcloud_server" "builder" {
  name        = "open-grind-builder-c"
  server_type = var.hetzner_plan
  location    = var.hetzner_location
  image       = var.hetzner_image
  ssh_keys    = var.hetzner_ssh_key_ids
  user_data   = var.user_data
}

output "ip" {
  value = hcloud_server.builder.ipv4_address
}
