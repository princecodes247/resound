fn main() {
    #[cfg(target_os = "macos")]
    {
        println!("cargo:rerun-if-changed=src/macos_aggregate.m");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreAudio");
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
        println!("cargo:rustc-link-search=native=/usr/lib/swift");
        cc::Build::new()
            .file("src/macos_aggregate.m")
            .flag("-fobjc-arc")
            .compile("macos_aggregate");
    }
    tauri_build::build()
}
