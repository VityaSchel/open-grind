terraform {
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "2.95.0"
    }
  }
  backend "s3" {
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

variable "digitalocean_token" {
  type      = string
  sensitive = true
}
variable "name" { type = string }
variable "plan" {
  type    = string
  default = "s-8vcpu-16gb"
}
variable "location" {
  type    = string
  default = "fra1"
}
variable "image" {
  type    = string
  default = "debian-12-x64"
}
variable "user_data" {
  type      = string
  sensitive = true
  default   = ""
}

provider "digitalocean" { token = var.digitalocean_token }

resource "digitalocean_droplet" "box" {
  name      = var.name
  size      = var.plan
  region    = var.location
  image     = var.image
  user_data = var.user_data
}
