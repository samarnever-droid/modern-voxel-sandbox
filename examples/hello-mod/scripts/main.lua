frontline.register_command("hello", function(args) return "Hello from Lua!" end)
frontline.on("block_placed", function(e) if e.block == "hello-mod:hello_block" then frontline.notify("Hello, world!") end end)
