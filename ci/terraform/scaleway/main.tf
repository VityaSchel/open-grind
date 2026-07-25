terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.78.0"
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

variable "scaleway_access_key" {
  type      = string
  sensitive = true
}
variable "scaleway_secret_key" {
  type      = string
  sensitive = true
}
variable "scaleway_project_id" { type = string }
variable "name" { type = string }
variable "plan" {
  type    = string
  default = "PRO2-S"
}
variable "location" {
  type    = string
  default = "fr-par-1"
}
variable "image" {
  type    = string
  default = "debian_bookworm"
}
variable "user_data" {
  type      = string
  sensitive = true
  default   = ""
}

provider "scaleway" {
  access_key = var.scaleway_access_key
  secret_key = var.scaleway_secret_key
  project_id = var.scaleway_project_id
}

resource "scaleway_instance_server" "box" {
  name              = var.name
  type              = var.plan
  zone              = var.location
  image             = var.image
  enable_dynamic_ip = true
  root_volume { size_in_gb = 80 }
  user_data = { "cloud-init" = var.user_data }
}
