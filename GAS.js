// --- CONFIGURATION ---
const SCRIPT_VERSION = "v26_Internal_Token_Auth";
const SOURCE_DATA_SHEET_ID = '143EspDcO0leMPNnUE_XJIs0YGVjdbVchq5SQMEut2Do';
const DESTINATION_SHEET_ID = '15q4fAjDO1U_cSWEGuIdhYn2LZNkcafEYpo6zIYlRRUQ';
const TEMPLATE_SHEET_NAME = 'Attendance Template';
const USERS_SHEET_NAME = 'Users';

// Get the secret key from script properties
const JWT_SECRET = PropertiesService.getScriptProperties().getProperty('JWT_SECRET');

// NEW: Add a check to ensure the secret key exists.
if (!JWT_SECRET) {
  throw new Error("CRITICAL_ERROR: 'JWT_SECRET' is not set in your Script Properties. Please go to Project Settings > Script Properties and add it.");
}


// --- LIBRARY-FREE TOKEN HELPER FUNCTIONS ---

function base64UrlEncode(text) {
  return Utilities.base64Encode(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(encodedText) {
  while (encodedText.length % 4) {
    encodedText += '=';
  }
  encodedText = encodedText.replace(/-/g, '+').replace(/_/g, '/');
  return Utilities.newBlob(Utilities.base64Decode(encodedText)).getDataAsString();
}

function createToken(userPayload) {
  const header = { "alg": "HS256", "typ": "JWT" };
  const claims = {
    'iss': 'StrataAttendanceApp',
    'sub': userPayload.username,
    'iat': Math.floor(Date.now() / 1000),
    'exp': Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7), // Expires in 7 days
    'user': userPayload
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaims = base64UrlEncode(JSON.stringify(claims));
  
  const signatureInput = `${encodedHeader}.${encodedClaims}`;
  const signatureBytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signatureInput, JWT_SECRET);
  const encodedSignature = base64UrlEncode(signatureBytes);

  return `${signatureInput}.${encodedSignature}`;
}

function verifyAndDecodeToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) { throw new Error("Invalid token format."); }

  const [encodedHeader, encodedClaims, encodedSignature] = parts;
  const signatureInput = `${encodedHeader}.${encodedClaims}`;
  
  const expectedSignatureBytes = Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_256, signatureInput, JWT_SECRET);
  const expectedSignature = base64UrlEncode(expectedSignatureBytes);

  if (encodedSignature !== expectedSignature) { throw new Error("Token signature validation failed."); }
  
  const claims = JSON.parse(base64UrlDecode(encodedClaims));
  if (claims.exp < Math.floor(Date.now() / 1000)) { throw new Error("Token has expired."); }
  
  return claims;
}

function getAuthenticatedUser(headers) {
    const authHeader = headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) { return null; }
    const token = authHeader.substring(7); // Remove "Bearer "
    try {
        const decoded = verifyAndDecodeToken(token);
        return decoded.user; // Return the user payload from the token
    } catch (e) {
        console.error("Token verification failed:", e.toString());
        return null;
    }
}


// --- MAIN HANDLER ---
function doPost(e) {
  let requestData;
  try {
    requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;

    if (action === 'loginUser') {
      return handleLogin(requestData.username, requestData.password);
    }

    const user = getAuthenticatedUser(e.requestHeaders);
    if (!user) {
      throw new Error("Authentication failed. Invalid or expired token.");
    }
    
    switch(action) {
      case 'getUsers':
        return handleGetUsers(user);
      case 'addUser':
        return handleAddUser(user, requestData.username, requestData.password, requestData.role, requestData.spAccess);
      case 'removeUser':
        return handleRemoveUser(user, requestData.username);
      case 'changePassword':
        return handleChangePassword(user, requestData.newPassword);
      case 'changeMeetingType':
        return handleChangeMeetingType(user, findSheet(requestData.sp), requestData.newMeetingType);
      
      case 'getStrataPlans':
        return handleGetStrataPlans();
      case 'batchSubmit':
        return handleBatchSubmit(requestData);
      case 'getAllNamesForPlan':
        return handleGetAllNamesForPlan(requestData.sp);
      case 'checkTodaysColumns':
        return handleCheckTodaysColumns(findSheet(requestData.sp));
      case 'createAndFetchInitialData':
        return handleCreateAndFetchInitialData(findSheet(requestData.sp), requestData.meetingType);
      case 'getInitialData':
        return handleGetInitialData(findSheet(requestData.sp));
      case 'delete':
        return handleDelete(findSheet(requestData.sp), requestData.lot);
      case 'emailPdfReport':
        return handleEmailPdfReport(requestData.sp, findSheet(requestData.sp), requestData.email);
      default:
        throw new Error(`Invalid 'action' parameter provided: ${action}`);
    }
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: `[v: ${SCRIPT_VERSION}] ${error.toString()}` }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- AUTHENTICATION & USER MANAGEMENT ---
function hashPassword(password) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}

function handleLogin(username, password) {
  const usersSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName(USERS_SHEET_NAME);
  const users = usersSheet.getDataRange().getValues();
  const passwordHash = hashPassword(password);
  
  for (let i = 1; i < users.length; i++) {
    if (users[i][0] === username && users[i][1] === passwordHash) {
      const userPayload = { 
        username: users[i][0], 
        role: users[i][2],
        spAccess: users[i][3] || null
      };
      const token = createToken(userPayload);
      return ContentService.createTextOutput(JSON.stringify({ 
        success: true, 
        token: token,
        user: userPayload
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  throw new Error("Invalid username or password.");
}

function isAdmin(user) {
  return user && user.role === 'Admin';
}

function handleGetUsers(user) {
  if (!isAdmin(user)) throw new Error("Permission denied.");
  const usersSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName(USERS_SHEET_NAME);
  const usersData = usersSheet.getRange(2, 1, usersSheet.getLastRow() - 1, 4).getValues();
  const users = usersData.map(row => ({ 
      username: row[0], 
      role: row[2],
      spAccess: row[3] || ''
    }));
  return ContentService.createTextOutput(JSON.stringify({ success: true, users })).setMimeType(ContentService.MimeType.JSON);
}

function handleAddUser(user, username, password, role, spAccess) {
  if (!isAdmin(user)) throw new Error("Permission denied.");
  const usersSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName(USERS_SHEET_NAME);
  const usernames = usersSheet.getRange("A2:A").getValues().flat();
  if (usernames.includes(username)) throw new Error("Username already exists.");
  
  const passwordHash = hashPassword(password);
  usersSheet.appendRow([username, passwordHash, role, spAccess || '']);
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

function handleRemoveUser(user, usernameToRemove) {
  if (!isAdmin(user)) throw new Error("Permission denied.");
  const usersSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName(USERS_SHEET_NAME);
  const usernames = usersSheet.getRange("A:A").getValues();
  const rowToDelete = usernames.findIndex(row => row[0] === usernameToRemove) + 1;
  if (rowToDelete > 1) {
    usersSheet.deleteRow(rowToDelete);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  throw new Error("User not found.");
}

function handleChangePassword(user, newPassword) {
  const usersSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName(USERS_SHEET_NAME);
  const usernames = usersSheet.getRange("A:A").getValues();
  const rowToUpdate = usernames.findIndex(row => row[0] === user.username) + 1;
  if (rowToUpdate > 1) {
    const newPasswordHash = hashPassword(newPassword);
    usersSheet.getRange(rowToUpdate, 2).setValue(newPasswordHash);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
  }
  throw new Error("User not found.");
}

function handleChangeMeetingType(user, sheet, newMeetingType) {
    if (!isAdmin(user)) throw new Error("Permission denied.");
    if (!newMeetingType) throw new Error("New meeting type is required.");
    const columns = getTodaysColumns(sheet);
    if (!columns) throw new Error("No meeting columns found for today to change.");
    const { attendanceCol } = columns;
    const today = new Date().toLocaleDateString("en-AU", {timeZone: "Australia/Sydney"});
    const thirdColumnName = newMeetingType.toUpperCase() === 'SCM' ? 'Committee' : 'Financial';
    sheet.getRange(1, attendanceCol).setValue(`${today} ${newMeetingType}`);
    sheet.getRange(1, attendanceCol + 2).setValue(`${today} ${thirdColumnName}`);
    return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

// --- APP FUNCTIONALITY ---
function findSheet(sp) {
    const ss = SpreadsheetApp.openById(DESTINATION_SHEET_ID);
    return findOrCreateDestinationSheet(ss, sp);
}

function handleGetStrataPlans() {
  const spreadsheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID);
  const sheet = spreadsheet.getSheetByName('Strata Plan List');
  if (!sheet) throw new Error("Could not find the 'Strata Plan List' tab.");
  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(2, 1, lastRow > 1 ? lastRow - 1 : 1, 2).getValues();
  const plans = data.filter(row => row[0]).map(row => ({ sp: row[0], suburb: row[1] }));
  return ContentService.createTextOutput(JSON.stringify({ success: true, plans })).setMimeType(ContentService.MimeType.JSON);
}

function handleBatchSubmit(requestData) {
  const submissions = requestData.submissions || [];
  if (submissions.length === 0) return ContentService.createTextOutput(JSON.stringify({ success: true, message: "No submissions to process." })).setMimeType(ContentService.MimeType.JSON);
  const ss = SpreadsheetApp.openById(DESTINATION_SHEET_ID);
  const submissionsBySp = submissions.reduce((acc, sub) => {
    acc[sub.sp] = acc[sub.sp] || [];
    acc[sub.sp].push(sub);
    return acc;
  }, {});
  for (const sp in submissionsBySp) {
    const sheet = findOrCreateDestinationSheet(ss, sp);
    const columns = getTodaysColumns(sheet);
    if (!columns) continue;
    const { attendanceCol, nameCol, financialCol } = columns;
    const lotColumnValues = sheet.getRange(2, 1, sheet.getLastRow() > 1 ? sheet.getLastRow() - 1 : 1, 1).getValues();
    const lotMap = new Map(lotColumnValues.map((row, i) => [String(row[0]).trim(), i + 2]));
    for (const submission of submissionsBySp[sp]) {
      const row = lotMap.get(String(submission.lot).trim());
      if (!row) continue;
      let nameString = submission.proxyHolderLot ? `Proxy - Lot ${submission.proxyHolderLot}`
        : (submission.companyRep ? `${submission.names[0]} - ${submission.companyRep}` : submission.names.join(', '));
      sheet.getRange(row, attendanceCol).setValue('Y');
      sheet.getRange(row, nameCol).setValue(nameString);
      if (submission.financial) sheet.getRange(row, financialCol).setValue('Y');
    }
  }
  SpreadsheetApp.flush();
  Utilities.sleep(1500);
  return ContentService.createTextOutput(JSON.stringify({ success: true, message: `${submissions.length} items processed.` })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetAllNamesForPlan(sp) {
  const sourceInfo = getSourceSheetInfo(sp);
  if (!sourceInfo) throw new Error(`Configuration error in 'Strata Plan List' for SP ${sp}.`);
  const sourceSheet = SpreadsheetApp.openById(sourceInfo.id).getSheetByName(sourceInfo.tabName);
  if (!sourceSheet) throw new Error(`The data tab '${sourceInfo.tabName}' could not be found.`);
  const lastRow = sourceSheet.getLastRow();
  if (lastRow < 2) return ContentService.createTextOutput(JSON.stringify({ success: true, names: {} })).setMimeType(ContentService.MimeType.JSON);
  
  const allData = sourceSheet.getRange(2, 3, lastRow - 1, (7 - 3 + 1)).getValues();
  const nameCache = {};
  
  allData.forEach(rowData => {
    const lotNumber = (rowData[0] || "").toString().trim();
    if (lotNumber) {
      const unitNumber = (rowData[1] || "").toString().trim();
      const mainContactName = (rowData[4] || "").toString().trim();
      const fullNameOnTitle = (rowData[3] || "").toString().trim();
      nameCache[lotNumber] = [unitNumber, mainContactName, fullNameOnTitle];
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify({ success: true, names: nameCache })).setMimeType(ContentService.MimeType.JSON);
}
function handleCheckTodaysColumns(sheet) {
  const columns = getTodaysColumns(sheet);
  return ContentService.createTextOutput(JSON.stringify({ success: true, columnsExist: columns !== null })).setMimeType(ContentService.MimeType.JSON);
}

function handleCreateAndFetchInitialData(sheet, meetingType) {
  if (!meetingType) throw new Error("Meeting Type is required.");
  getTodaysColumns(sheet, meetingType);
  return handleGetInitialData(sheet);
}

function handleGetInitialData(sheet) {
  const columns = getTodaysColumns(sheet);
  if (!columns) return ContentService.createTextOutput(JSON.stringify({ success: true, attendanceCount: 0, totalLots: 0, attendees: [], meetingType: null })).setMimeType(ContentService.MimeType.JSON);
  
  const { attendanceCol, nameCol, meetingType } = columns;
  const lotColumnValues = sheet.getRange("A2:A").getValues();
  const totalLots = lotColumnValues.filter(row => String(row[0]).trim() !== '').length;
  let attendees = [];
  if (sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    for (const row of data) {
      if (row[0] && row[attendanceCol - 1] === 'Y') {
        attendees.push({ lot: row[0], name: String(row[nameCol - 1]) });
      }
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, attendanceCount: attendees.length, totalLots, attendees, meetingType })).setMimeType(ContentService.MimeType.JSON);
}

function handleDelete(sheet, lot) {
  if (!lot) throw new Error("Lot number is required for deletion.");
  const columns = getTodaysColumns(sheet);
  if (!columns) throw new Error("Could not find today's columns.");
  const { attendanceCol } = columns;
  const lotColumnValues = sheet.getRange("A2:A").getValues();
  const lotRow = lotColumnValues.findIndex(row => String(row[0]).trim() == String(lot).trim()) + 2;
  if (lotRow > 1) {
    sheet.getRange(lotRow, attendanceCol, 1, 3).clearContent();
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: `Lot ${lot} cleared.`})).setMimeType(ContentService.MimeType.JSON);
  }
  throw new Error(`Lot ${lot} not found.`);
}

function handleEmailPdfReport(sp, sheet, email) {
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("A valid email address is required.");
  
  const ss = SpreadsheetApp.openById(DESTINATION_SHEET_ID);
  const reportSheet = ss.getSheetByName('PDF Report');
  if (!reportSheet) throw new Error("A sheet named 'PDF Report' must exist.");
  
  if (reportSheet.getMaxRows() > 2) {
    reportSheet.getRange(3, 2, reportSheet.getMaxRows() - 2, 3).clear({contentsOnly: true, formatOnly: true});
  }

  const columns = getTodaysColumns(sheet);
  if (!columns) throw new Error("Could not find today's attendance data to generate a report.");
  
  const { attendanceCol, nameCol, meetingType } = columns;
  let attendees = [];
  if (sheet.getLastRow() > 1) {
    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    for (const row of data) {
      if (row[0] && row[attendanceCol - 1] === 'Y') attendees.push({ lot: row[0], name: String(row[nameCol - 1] || '') });
    }
  }

  const today = new Date().toLocaleDateString("en-AU", {timeZone: "Australia/Sydney"});
  
  const titleRange = reportSheet.getRange("B1:D1");
  titleRange.merge();
  titleRange.setValue(`SP ${sp} | ${today} ${meetingType}`);
  titleRange.setHorizontalAlignment("center").setVerticalAlignment("middle");

  if (attendees.length > 0) {
    attendees.sort((a, b) => a.lot - b.lot);
    const reportData = attendees.map(item => {
      const name = item.name;
      const isProxy = String(name).startsWith('Proxy - Lot');
      const isCompany = !isProxy && /\b(P\/L|Pty Ltd|Limited)\b/i.test(name);
      let ownerRepName = '', companyName = '';
      if (isProxy) ownerRepName = name;
      else if (isCompany) {
        const parts = name.split(' - ');
        companyName = parts[0].trim();
        if (parts.length > 1) ownerRepName = parts[1].trim();
      } else ownerRepName = name;
      return [item.lot, ownerRepName, companyName];
    });
    
    const dataRange = reportSheet.getRange(3, 2, reportData.length, 3);
    dataRange.setValues(reportData);
    dataRange.setHorizontalAlignment('left');
    
    for (let i = 0; i < reportData.length; i++) {
        if (i % 2 !== 0) {
            reportSheet.getRange(i + 3, 2, 1, 3).setBackground('#f2f2f2');
        } else {
            reportSheet.getRange(i + 3, 2, 1, 3).setBackground(null);
        }
    }
  } else {
    reportSheet.getRange("B3").setValue("No attendees recorded.");
  }

  const url = `https://docs.google.com/spreadsheets/d/${DESTINATION_SHEET_ID}/export?gid=${reportSheet.getSheetId()}&format=pdf&size=A4&portrait=true&gridlines=false&range=A1:E${reportSheet.getLastRow()}`;
  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
  const blob = response.getBlob().setName(`Attendance Report - SP ${sp} - ${today}.pdf`);
  
  MailApp.sendEmail(email, `Attendance Report for SP ${sp}`, "Please find the attendance report attached.", { attachments: [blob] });
  
  return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
}

// --- HELPER FUNCTIONS ---
function getSourceSheetInfo(strataPlanNumber) {
  const listSheet = SpreadsheetApp.openById(SOURCE_DATA_SHEET_ID).getSheetByName('Strata Plan List');
  const data = listSheet.getRange(2, 1, listSheet.getLastRow() - 1, 1).getValues();
  const found = data.find(row => row[0] == strataPlanNumber);
  if (!found) return null;
  return { id: SOURCE_DATA_SHEET_ID, tabName: String(strataPlanNumber) };
}

function findOrCreateDestinationSheet(ss, strataPlanNumber) {
  const sheetName = String(strataPlanNumber);
  let sheet = ss.getSheetByName(sheetName);
  if (sheet) return sheet;
  const template = ss.getSheetByName(TEMPLATE_SHEET_NAME);
  if (!template) throw new Error(`Template sheet '${TEMPLATE_SHEET_NAME}' not found.`);
  return template.copyTo(ss).setName(sheetName);
}

function getTodaysColumns(sheet, meetingType = null) {
  const today = new Date().toLocaleDateString("en-AU", {timeZone: "Australia/Sydney"});
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  const todayColIndex = headers.findIndex(header => header && header.toString().startsWith(today));
  
  if (todayColIndex !== -1) {
    const headerText = headers[todayColIndex];
    const foundMeetingType = headerText.replace(today, '').trim();
    return {
      attendanceCol: todayColIndex + 1,
      nameCol: todayColIndex + 2,
      financialCol: todayColIndex + 3,
      meetingType: foundMeetingType
    };
  }
  
  if (meetingType) {
    const lastCol = sheet.getLastColumn();
    const newAttendanceCol = lastCol > 0 ? lastCol + 1 : 1;
    const thirdColumnName = meetingType.toUpperCase() === 'SCM' ? 'Committee' : 'Financial';
    
    sheet.getRange(1, newAttendanceCol).setValue(`${today} ${meetingType}`);
    sheet.getRange(1, newAttendanceCol + 1).setValue(`${today} Name`);
    sheet.getRange(1, newAttendanceCol + 2).setValue(`${today} ${thirdColumnName}`);
    sheet.setColumnWidths(newAttendanceCol, 3, 120);

    try {
      const sp = sheet.getName();
      const sourceInfo = getSourceSheetInfo(sp);
      if (!sourceInfo) throw new Error(`Could not find source sheet configuration for SP ${sp}.`);
      
      const sourceSheet = SpreadsheetApp.openById(sourceInfo.id).getSheetByName(sourceInfo.tabName);
      if (!sourceSheet) throw new Error(`Could not open source sheet tab '${sourceInfo.tabName}'.`);
      
      const lastRow = sourceSheet.getLastRow();
      if (lastRow > 1) {
        const sourceValues = sourceSheet.getRange(2, 3, lastRow - 1, 2).getValues();
        sheet.getRange(2, 1, sourceValues.length, sourceValues[0].length).setValues(sourceValues);
      }
    } catch (e) {
      console.error(`Failed to copy master data for SP ${sheet.getName()}: ${e.toString()}`);
    }

    return {
      attendanceCol: newAttendanceCol,
      nameCol: newAttendanceCol + 1,
      financialCol: newAttendanceCol + 2,
      meetingType: meetingType
    };
  }
  
  return null;
}
