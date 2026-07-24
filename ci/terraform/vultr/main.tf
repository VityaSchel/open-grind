terraform {
  required_providers {
    vultr = {
      source  = "vultr/vultr"
      version = "2.31.2"
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

variable "vultr_token" {
  type      = string
  sensitive = true
}
variable "name" { type = string }
variable "plan" {
  type    = string
  default = ""
}
variable "location" {
  type    = string
  default = ""
}
variable "image" {
  type    = number
  default = 2136 # Vultr os_id for Debian 12 x64
}
variable "user_data" {
  type      = string
  sensitive = true
  default   = ""
}

provider "vultr" { api_key = var.vultr_token }

resource "vultr_instance" "box" {
  hostname         = var.name
  label            = var.name
  plan             = var.plan
  region           = var.location
  os_id            = var.image
  user_data        = var.user_data
  activation_email = false
}
