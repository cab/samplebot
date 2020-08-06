use crate::dropbox::Client as DropboxClient;
use serenity::prelude::*;
use serenity::{
  async_trait,
  framework::standard::{
    help_commands,
    macros::{check, command, group, help},
    Args, CheckResult, CommandGroup, CommandOptions, CommandResult, DispatchError, HelpOptions,
    StandardFramework,
  },
  http::Http,
  model::{
    channel::{Channel, Message},
    gateway::Ready,
    id::UserId,
  },
};
use std::collections::HashSet;
use thiserror::Error as ThisError;

struct DropboxKey;

impl TypeMapKey for DropboxKey {
  type Value = DropboxClient;
}

pub struct Bot {
  client: Client,
}

impl Bot {
  pub async fn new(token: &str, dropbox: DropboxClient) -> Result<Self, Error> {
    let http = Http::new_with_token(&token);
    let (owners, bot_id) = http.get_current_application_info().await.map(|info| {
      let mut owners = HashSet::new();
      owners.insert(info.owner.id);

      (owners, info.id)
    })?;
    let framework = StandardFramework::new()
      .configure(|c| {
        c.with_whitespace(true)
          .on_mention(Some(bot_id))
          .prefix("sb!")
          .delimiters(vec![", ", ","])
          .owners(owners)
      })
      .help(&MY_HELP)
      .group(&SAMPLES_GROUP);
    let mut client = Client::new(token)
      .event_handler(Handler)
      .framework(framework)
      .await
      .expect("Err creating client");
    {
      let mut data = client.data.write().await;
      data.insert::<DropboxKey>(dropbox);
    }
    Ok(Bot { client })
  }

  pub async fn start(&mut self) -> Result<(), Error> {
    self.client.start().await?;
    Ok(())
  }
}

#[derive(ThisError, Debug)]
pub enum Error {
  #[error(transparent)]
  DiscordError(#[from] serenity::Error),
}

struct Handler;

#[async_trait]
impl EventHandler for Handler {
  async fn ready(&self, _: Context, ready: Ready) {
    println!("{} is connected!", ready.user.name);
  }
}

#[group]
#[commands(add_sample)]
struct Samples;

#[command("samples.add")]
async fn add_sample(ctx: &Context, msg: &Message, mut args: Args) -> CommandResult {
  if let Ok(url) = args.single::<String>() {
    let data = ctx.data.read().await;
    let dropbox = data.get::<DropboxKey>().unwrap();
    let sample = crate::youtube::download(&url).await.expect("todo");
    let link = dropbox.upload_sample(&sample).expect("todo");
    msg.reply(&ctx, link).await;
  }
  Ok(())
}

#[help]
#[individual_command_tip = "If you want more information about a specific command, just pass the command as argument."]
#[command_not_found_text = "Could not find: `{}`."]
#[max_levenshtein_distance(3)]
#[indention_prefix = "+"]
#[lacking_permissions = "Hide"]
#[lacking_role = "Nothing"]
#[wrong_channel = "Strike"]
async fn my_help(
  context: &Context,
  msg: &Message,
  args: Args,
  help_options: &'static HelpOptions,
  groups: &[&'static CommandGroup],
  owners: HashSet<UserId>,
) -> CommandResult {
  help_commands::with_embeds(context, msg, args, help_options, groups, owners).await;
  Ok(())
}
