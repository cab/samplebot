use crate::Sample;
use dropbox_sdk::client_trait::HttpClient;
use dropbox_sdk::{files, sharing, HyperClient, Oauth2AuthorizeUrlBuilder, Oauth2Type};
use slug::slugify;
use thiserror::Error as ThisError;

const SAMPLE_PATH: &str = "/samples";
const CHALLENGES_PATH: &str = "/challenges";

pub struct Client {
  http_client: HyperClient,
}

#[derive(Debug, ThisError)]
pub enum Error {
  #[error(transparent)]
  SdkError(#[from] dropbox_sdk::Error),
  #[error(transparent)]
  UploadError(#[from] dropbox_sdk::files::UploadError),
  #[error(transparent)]
  SharingError(#[from] dropbox_sdk::sharing::CreateSharedLinkError),
}

impl Client {
  pub fn new(token: String) -> Self {
    let http_client = HyperClient::new(token);
    Self { http_client }
  }

  pub fn upload_sample(&self, sample: &Sample) -> Result<String, Error> {
    let path = &format!(
      "{}/{}.{}",
      SAMPLE_PATH,
      slugify(&sample.title),
      sample.format
    );
    let result = files::upload(
      &self.http_client,
      &files::CommitInfo::new(path.to_owned()),
      &sample.data,
    )??;
    let link = sharing::create_shared_link(
      &self.http_client,
      &sharing::CreateSharedLinkArg::new(path.to_owned()).with_short_url(true),
    )??;
    Ok(link.url)
  }
}
