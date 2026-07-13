variable "cherry_api_token" {
  type      = string
  sensitive = true
}
variable "vultr_api_key" {
  type      = string
  sensitive = true
}

variable "runners" {
  type = object({
    a = object({ uuid = string, token = string })
    b = object({ uuid = string, token = string })
  })
  sensitive = true
}

variable "forgejo_url" { type = string }

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

variable "vultr_plan" { type = string }
variable "vultr_region" { type = string }
variable "vultr_os_id" {
  type    = number
  default = 2136 # Debian 12 x64
}
variable "vultr_ssh_key_ids" {
  type    = list(string)
  default = []
}
