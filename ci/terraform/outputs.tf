output "builder_a_ip" {
  value = cherryservers_server.builder_a.ip_addresses
}
output "builder_b_ip" {
  value = vultr_bare_metal_server.builder_b.main_ip
}
