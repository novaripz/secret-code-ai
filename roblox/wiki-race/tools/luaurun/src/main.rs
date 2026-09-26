use mlua::{Lua, Result, Table};

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let lua = Lua::new();
    let g = lua.globals();
    g.set("readfile", lua.create_function(|_, p: String| Ok(std::fs::read_to_string(&p).ok()))?)?;
    g.set("isdir", lua.create_function(|_, p: String| Ok(std::path::Path::new(&p).is_dir()))?)?;
    g.set("listdir", lua.create_function(|lua, p: String| {
        let t = lua.create_table()?;
        if let Ok(rd) = std::fs::read_dir(&p) {
            let mut names: Vec<String> = rd.filter_map(|e| e.ok()).map(|e| e.file_name().to_string_lossy().to_string()).collect();
            names.sort();
            for (i, n) in names.into_iter().enumerate() { t.set(i + 1, n)?; }
        }
        Ok(t)
    })?)?;
    g.set("loadchunk", lua.create_function(|lua, (src, name, env): (String, String, Table)| {
        lua.load(&src).set_name(name).set_environment(env).into_function()
    })?)?;
    if args.len() > 1 && args[1] == "--check" {
        let mut failed = 0;
        for f in &args[2..] {
            let src = std::fs::read_to_string(f).expect("read");
            if let Err(e) = lua.load(&src).set_name(f.as_str()).into_function() {
                failed += 1;
                eprintln!("{}", e);
            }
        }
        if failed > 0 { std::process::exit(1) }
        println!("syntax ok: {} files", args.len() - 2);
        return Ok(());
    }
    let src = std::fs::read_to_string(&args[1]).expect("read");
    let argt = lua.create_table()?;
    for (i, a) in args[2..].iter().enumerate() { argt.set(i + 1, a.clone())?; }
    g.set("arg", argt)?;
    if let Err(e) = lua.load(&src).set_name(args[1].as_str()).exec() {
        eprintln!("{}", e);
        std::process::exit(1);
    }
    Ok(())
}
