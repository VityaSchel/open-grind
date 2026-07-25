terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "1.66.0"
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

variable "hetzner_token" {
  type      = string
  sensitive = true
}
variable "name" { type = string }
variable "plan" {
  type    = string
  default = "cx43"
}
variable "location" {
  type    = string
  default = "fsn1"
}
variable "image" {
  type    = string
  default = "debian-12"
}
variable "user_data" {
  type      = string
  sensitive = true
  default   = ""
}

provider "hcloud" { token = var.hetzner_token }

resource "hcloud_server" "box" {
  name        = var.name
  server_type = var.plan
  location    = var.location
  image       = var.image
  user_data   = var.user_data
}
