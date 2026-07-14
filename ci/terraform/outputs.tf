# output "builder_a_ip" {
#   value = cherryservers_server.builder_a.ip_addresses
# }
# output "builder_b_ip" {
#   value = vultr_instance.builder_b.main_ip
# }
output "builder_c_ip" {
  value = hcloud_server.builder_c.ipv4_address
}
# output "builder_d_ip" {
#   value = scaleway_instance_server.builder_d.public_ips[*].address
# }
# output "builder_e_ip" {
#   value = digitalocean_droplet.builder_e.ipv4_address
# }
