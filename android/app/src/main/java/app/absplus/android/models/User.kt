package app.absplus.android.models

import app.absplus.android.data.MediaProgress
import com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(ignoreUnknown = true)
data class User(
  val id:String,
  val username: String,
  val mediaProgress:List<MediaProgress>
)
