const ALLOWED_INEQUALITY = 0.3;

module.exports = function similarEnough({ image1Data, image2Data }) {
  const { length } = image1Data;
  if (length !== image2Data.length) {
    return false;
  }
  const allowedInequalRows = length * ALLOWED_INEQUALITY;
  let inequalRows = 0;
  for (let i = 0; i < length; i++) {
    const row = image1Data[i];
    for (let j = 0; j < row.length; j++) {
      if (image1Data[i][j] !== image2Data[i][j]) {
        inequalRows++;
        if (inequalRows > allowedInequalRows) {
          return false;
        }
        break;
      }
    }
  }
  return true;
}

