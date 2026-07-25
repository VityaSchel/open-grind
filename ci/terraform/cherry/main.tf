terraform {
  required_providers {
    cherryservers = {
      source  = "cherryservers/cherryservers"
      version = "1.5.3"
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

variable "cherry_token" {
  type      = string
  sensitive = true
}
variable "cherry_project_id" { type = number }
variable "name" { type = string }
variable "plan" {
  type    = string
  default = "G1-8-32gb-200nv-ded"
}
variable "location" {
  type    = string
  default = "LT-Siauliai"
}
variable "image" {
  type    = string
  default = "debian_12_64bit"
}
variable "user_data" {
  type      = string
  sensitive = true
  default   = ""
}

provider "cherryservers" { api_token = var.cherry_token }

resource "cherryservers_server" "box" {
  project_id = var.cherry_project_id
  hostname   = var.name
  plan       = var.plan
  region     = var.location
  image      = var.image
  user_data  = base64encode(var.user_data)
}
