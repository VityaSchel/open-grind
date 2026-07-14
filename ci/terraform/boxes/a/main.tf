terraform {
  required_providers {
    cherryservers = {
      source  = "cherryservers/cherryservers"
      version = "1.5.3"
    }
  }
}

variable "cherry_api_token" {
  type      = string
  sensitive = true
}
variable "cherry_project_id" { type = number }
variable "cherry_plan" { type = string }
variable "cherry_region" { type = string }
variable "cherry_image" {
  type    = string
  default = "debian_12_64bit"
}
variable "cherry_ssh_key_ids" {
  type    = list(string)
  default = []
}
variable "user_data" {
  type      = string
  sensitive = true
}

provider "cherryservers" { api_token = var.cherry_api_token }

resource "cherryservers_server" "builder" {
  project_id  = var.cherry_project_id
  plan        = var.cherry_plan
  region      = var.cherry_region
  image       = var.cherry_image
  hostname    = "open-grind-builder-a"
  ssh_key_ids = var.cherry_ssh_key_ids
  user_data   = base64encode(var.user_data)
}

output "ip" {
  value = cherryservers_server.builder.ip_addresses
}
