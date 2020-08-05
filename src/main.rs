mod youtube;

#[derive(Debug)]
enum SampleSource {
    Youtube(youtube::Source),
}

fn main() {
    println!("Hello, world!");
}
