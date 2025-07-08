const i = (function* () {
	let i = 1;
	while (true) {
		yield i++;
	}
})();
function iota() {
	return i.next().value;
}

const errors = {};

//@formatter:off
errors[errors["ERROR_UNKNOWN_COMMAND"  ] = iota()] = "ERROR_UNKNOWN_COMMAND"  ;
errors[errors["ERROR_BAD_COMMAND"      ] = iota()] = "ERROR_BAD_COMMAND"      ;
errors[errors["ERROR_KEY_NOT_FOUND"    ] = iota()] = "ERROR_KEY_NOT_FOUND"    ;
errors[errors["ERROR_SET_NOT_SUPPORTED"] = iota()] = "ERROR_SET_NOT_SUPPORTED";
errors[errors["ERROR_GET_NOT_SUPPORTED"] = iota()] = "ERROR_GET_NOT_SUPPORTED";
errors[errors["ERROR_IN_OPERATION"     ] = iota()] = "ERROR_IN_OPERATION"     ;
//@formatter:on

module.exports = {
	errors
};
