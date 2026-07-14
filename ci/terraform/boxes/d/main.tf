terraform {
  required_providers {
    scaleway = {
      source  = "scaleway/scaleway"
      version = "2.78.0"
    }
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
variable "scaleway_plan" { type = string }
variable "scaleway_zone" { type = string }
variable "scaleway_image" {
  type    = string
  default = "debian_bookworm"
}
variable "user_data" {
  type      = string
  sensitive = true
}

provider "scaleway" {
  access_key = var.scaleway_access_key
  secret_key = var.scaleway_secret_key
  project_id = var.scaleway_project_id
}

resource "scaleway_instance_server" "builder" {
  name              = "open-grind-builder-d"
  type              = var.scaleway_plan
  zone              = var.scaleway_zone
  image             = var.scaleway_image
  enable_dynamic_ip = true
  root_volume { size_in_gb = 80 }
  user_data = { "cloud-init" = var.user_data }
}

output "ip" {
  value = scaleway_instance_server.builder.public_ips[*].address
}
