mod discord;
mod dropbox;
mod youtube;

#[derive(Debug)]
pub struct Sample {
    title: String,
    format: String,
    data: Vec<u8>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dropbox_client =
        dropbox::Client::new(std::env::var("DROPBOX_ACCESS_TOKEN").expect("DROPBOX_ACCESS_TOKEN"));
    let mut bot = discord::Bot::new(
        &std::env::var("DISCORD_TOKEN").expect("DISCORD_TOKEN"),
        dropbox_client,
    )
    .await?;
    bot.start().await?;
    Ok(())
}
