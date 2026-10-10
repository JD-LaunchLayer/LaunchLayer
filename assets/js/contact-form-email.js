(function () {
  function clean(value) {
    return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
  }

  // Netlify uses a hidden input named subject. Service and town are not
  // among its subject placeholders, so the page sets the value on submit.
  function notificationSubject(service, townValue, townLabel) {
    var serviceName = clean(service);
    var town = clean(townValue);
    var place = town && town !== "prefer-not-to-say" && town !== "other" ? clean(townLabel) : "";
    var about = serviceName;
    if (about && !/enquiry$/i.test(about)) about += " enquiry";
    if (!about) about = "website enquiry";
    var text = "New " + about + " – " + (place || "LaunchLayer");
    return text.length > 180 ? text.slice(0, 180).trim() : text;
  }

  window.llNotificationSubject = notificationSubject;
})();
