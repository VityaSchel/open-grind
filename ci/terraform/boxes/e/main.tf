terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "2.95.0"
    }
  }
}

variable "digitalocean_token" {
  type      = string
  sensitive = true
}
variable "digitalocean_size" { type = string }
variable "digitalocean_region" { type = string }
variable "digitalocean_image" {
  type    = string
  default = "debian-12-x64"
}
variable "digitalocean_ssh_key_ids" {
  type    = list(string)
  default = []
}
variable "user_data" {
  type      = string
  sensitive = true
}

provider "digitalocean" { token = var.digitalocean_token }

resource "digitalocean_droplet" "builder" {
  name      = "open-grind-builder-e"
  size      = var.digitalocean_size
  region    = var.digitalocean_region
  image     = var.digitalocean_image
  ssh_keys  = var.digitalocean_ssh_key_ids
  user_data = var.user_data
}

output "ip" {
  value = digitalocean_droplet.builder.ipv4_address
}
