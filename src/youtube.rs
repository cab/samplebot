use thiserror::Error as ThisError;
use tokio::process::Command;

#[derive(Debug)]
pub struct Source {
  url: String,
}

#[derive(Debug, ThisError)]
pub enum Error {
  #[error("failed to spawn youtube-dl")]
  SpawnError(#[from] std::io::Error),
  #[error("invalid youtube url")]
  InvalidUrl,
}

async fn download(url: &str) -> Result<(), Error> {
  let status = Command::new("youtube-dl")
    .arg(url)
    .arg("--extract-audio")
    .args(&["--audio-format", "best"])
    .args(&["--audio-quality", "0"])
    .kill_on_drop(true)
    .spawn()
    .map_err(|e| Error::SpawnError(e))?
    .await?;
  println!("the command exited with: {}", status);
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[tokio::test]
  async fn it_ok() {
    download("https://www.youtube.com/watch?v=F6dGAZTj8xA")
      .await
      .expect("success");
  }
}

#[cfg(target_os = "disabled")]
mod direct {

  use lazy_static::lazy_static;
  use regex::Regex;
  use serde::Deserialize;
  use thiserror::Error as ThisError;

  #[derive(Debug)]
  struct Stream {
    url: String,
    quality: String,
    stream_type: String,
  }

  #[derive(Debug, ThisError)]
  pub enum Error {
    #[error(transparent)]
    Reqwest(#[from] reqwest::Error),
    #[error(transparent)]
    SerdeJson(#[from] serde_json::Error),
    #[error(transparent)]
    SerdeUrl(#[from] serde_urlencoded::de::Error),
    #[error("invalid youtube url")]
    InvalidUrl,
  }

  #[derive(Deserialize, Debug)]
  struct VideoInfoResponse {
    author: String,
    video_id: String,
    status: String,
    title: String,
    thumbnail_url: String,
    url_encoded_fmt_stream_map: String,
    view_count: usize,
    adaptive_fmts: Option<String>,
    hlsvp: Option<String>,
  }

  lazy_static! {
    static ref URL_REGEX: Regex = Regex::new(
      r"^.*(?:(?:youtu\.be/|v/|vi/|u/w/|embed/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*"
    )
    .unwrap();
  }

  async fn download(url: &str) -> Result<(), Error> {
    let vid_split = URL_REGEX.captures(url).ok_or(Error::InvalidUrl)?;
    let vid = vid_split.get(1).ok_or(Error::InvalidUrl)?.as_str();
    let info_url = format!("https://youtube.com/get_video_info?video_id={}", vid);
    let body = reqwest::get(&info_url).await?.text().await?;
    let params = serde_urlencoded::from_str::<std::collections::HashMap<String, String>>(&body)?;
    println!("lol {}", params.get("player_response").unwrap());
    let info = serde_json::from_str::<VideoInfoResponse>(
      params.get("player_response").ok_or(Error::InvalidUrl)?,
    );
    println!("lol {:?}", info);
    Ok(())
  }

  #[cfg(test)]
  mod tests {
    use super::*;

    #[tokio::test]
    async fn it_ok() {
      download("https://www.youtube.com/watch?v=F6dGAZTj8xA").await;
    }
  }
}
