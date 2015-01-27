Vagrant.configure("2") do |config|
  config.vm.define "dns-server" do |app|
    app.vm.network "forwarded_port", guest: 53, host: 5300, protocol: 'udp'
    app.vm.provider "docker" do |d|
      d.image = "node:0.10"
      d.cmd   = ["node", "/vagrant/src/server.js"]
#      d.ports = ["5300:53/udp"]
    end
  end
end
